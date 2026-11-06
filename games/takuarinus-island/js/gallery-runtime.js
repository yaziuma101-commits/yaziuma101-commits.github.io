// 絵画の館をブラウザで動かすときの仕掛け（three.js は引数で受け取る。読み込み時には DOM に触らない）。
// ・絵（textures/drawings/）を読み込んだら canvas で下ごしらえ（drawing-prep.js）してから貼る。
//   ミップマップは作らず（generateMipmaps = false）、拡大・縮小とも LinearFilter、異方性は最大。
// ・波打ちのシェーダーに明るさを足す行が残っていても、コンパイル前に取り除く（保険）。
// ・近づいたときの札（HTML）に、その絵の元画像を一緒に出す。
import { PALETTE } from './palette.js';
import { prepareDrawing } from './drawing-prep.js';
import { DRAWINGS_DIR } from './gallery-data.js';
import { setLabelPresenter } from './gallery-labels.js';

export const DRAWING_LONG_SIDE = 256;
export const LABEL_IMAGE_WIDTH = 200;
/** renderer が分からないときの値（three.js が renderer の最大値で頭打ちにする） */
const FALLBACK_ANISOTROPY = 16;
const PATCHED = '__drawingPrepPatched';
const GUARDED = '__brightnessGuarded';

/** 館の絵のファイルか */
export function isDrawingUrl(url) {
  return typeof url === 'string' && url.includes(DRAWINGS_DIR) && /\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(url);
}

function imageSize(img) {
  if (!img) return null;
  const w = img.naturalWidth || img.videoWidth || img.width || 0;
  const h = img.naturalHeight || img.videoHeight || img.height || 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

/** 元画像を下ごしらえした canvas。使えなければ Error */
export function prepareDrawingCanvas(image, { doc, longSide = DRAWING_LONG_SIDE } = {}) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) throw new Error('canvas が使えません');
  const size = imageSize(image);
  if (!size) throw new Error('絵の大きさが分かりません');
  const src = d.createElement('canvas');
  src.width = size.w;
  src.height = size.h;
  const g = src.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D の canvas が使えません');
  g.drawImage(image, 0, 0, size.w, size.h);
  const id = g.getImageData(0, 0, size.w, size.h);
  const out = prepareDrawing({ data: id.data, width: size.w, height: size.h }, longSide);
  const canvas = d.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  const g2 = canvas.getContext('2d');
  if (!g2) throw new Error('2D の canvas が使えません');
  const img2 = g2.createImageData(out.width, out.height);
  img2.data.set(out.data);
  g2.putImageData(img2, 0, 0);
  // 元の大きさ（縦横比）を読む場面のために残す
  try {
    canvas.naturalWidth = size.w;
    canvas.naturalHeight = size.h;
  } catch {
    // 読み取り専用なら気にしない
  }
  return canvas;
}

/** renderer の最大の異方性 */
export function maxAnisotropy(renderer) {
  try {
    const caps = renderer && renderer.capabilities;
    if (caps && typeof caps.getMaxAnisotropy === 'function') {
      const v = caps.getMaxAnisotropy();
      if (v > 0) return v;
    }
  } catch {
    // 下の値を使う
  }
  return FALLBACK_ANISOTROPY;
}

/** 下ごしらえした絵のテクスチャの設定 */
export function applyDrawingFilters(THREE, tex, renderer) {
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy(renderer);
  tex.needsUpdate = true;
  return tex;
}

/** 元画像から下ごしらえした CanvasTexture を作る。失敗したら元画像のまま */
export function makeDrawingTexture(THREE, image, { renderer, colorSpace, doc } = {}) {
  let tex;
  try {
    tex = new THREE.CanvasTexture(prepareDrawingCanvas(image, { doc }));
    applyDrawingFilters(THREE, tex, renderer);
  } catch (err) {
    console.warn('絵の下ごしらえに失敗したので、そのまま貼ります:', err);
    tex = new THREE.Texture(image);
    tex.needsUpdate = true;
  }
  if (colorSpace !== undefined) tex.colorSpace = colorSpace;
  return tex;
}

let rendererRef = null;
/** 異方性の最大値を読む renderer を覚える */
export function setDrawingRenderer(renderer) {
  rendererRef = renderer || null;
}

/** TextureLoader で館の絵を読んだとき、下ごしらえしてから渡す。何度呼んでも1回だけ包む */
export function installDrawingPrep(THREE, { doc, renderer } = {}) {
  if (renderer) rendererRef = renderer;
  const proto = THREE && THREE.TextureLoader && THREE.TextureLoader.prototype;
  if (!proto || typeof proto.load !== 'function') return false;
  if (proto[PATCHED]) return true;
  const orig = proto.load;
  proto.load = function loadDrawing(url, onLoad, onProgress, onError) {
    if (!isDrawingUrl(url)) return orig.call(this, url, onLoad, onProgress, onError);
    return orig.call(this, url, (tex) => {
      let ok = false;
      try {
        tex.image = prepareDrawingCanvas(tex.image, { doc });
        ok = true;
      } catch (err) {
        console.warn('絵の下ごしらえに失敗したので、そのまま貼ります:', err);
      }
      if (ok) applyDrawingFilters(THREE, tex, rendererRef);
      if (typeof onLoad === 'function') onLoad(tex);
      // 場面側が設定し直しても、下ごしらえした絵の設定にそろえる（色空間は場面の設定のまま）
      if (ok) applyDrawingFilters(THREE, tex, rendererRef);
    }, onProgress, onError);
  };
  Object.defineProperty(proto, PATCHED, { value: true });
  return true;
}

// 「amp で明るさを足す行」（例: 色に vec3(amp …) を足し込む行）
const BRIGHT_ADD = new RegExp('[A-Za-z_]\\w*\\s*\\+=\\s*vec3\\(\\s*u?[Aa]mp\\b[^;]*;', 'g');

/** シェーダーの文字列から、明るさを足す行を取り除く */
export function stripBrightnessAdd(src) {
  return typeof src === 'string' ? src.replace(BRIGHT_ADD, '') : src;
}

/** コンパイル前に明るさを足す行を取り除く（保険。何度呼んでも1回だけ） */
export function installShaderBrightnessGuard(THREE) {
  const proto = THREE && THREE.Material && THREE.Material.prototype;
  if (!proto) return false;
  if (proto[GUARDED]) return true;
  const prev = proto.onBeforeCompile;
  proto.onBeforeCompile = function guardBrightness(shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    if (shader && typeof shader.fragmentShader === 'string') {
      shader.fragmentShader = stripBrightnessAdd(shader.fragmentShader);
    }
  };
  Object.defineProperty(proto, GUARDED, { value: true });
  return true;
}

/** 札に元画像を添える。札の要素（題名と行き先の文字を含む要素）が見つからなければ画面に単独で出す */
export function createLabelImage(env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  let img = null;
  let host = null;
  let hostKey = '';
  let floating = false;
  let timer = null;
  let lastMiss = { key: '', at: -Infinity };

  function ensure() {
    if (img || !doc) return img;
    img = doc.createElement('img');
    img.className = 'gallery-label-img';
    img.alt = '';
    Object.assign(img.style, {
      display: 'block',
      width: `${LABEL_IMAGE_WIDTH}px`,
      height: 'auto',
      imageRendering: 'auto',
      margin: '8px auto 0',
      border: `3px solid ${PALETTE.ffPicBg}`,
      borderRadius: '0',
      background: PALETTE.ffPicBg,
      pointerEvents: 'none',
    });
    return img;
  }

  function findHost(label) {
    if (!doc || !doc.body || !label || !label.title) return null;
    let best = null;
    let bestLen = Infinity;
    for (const el of doc.body.querySelectorAll('*')) {
      if (el === img) continue;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS' || tag === 'IMG') continue;
      const tx = el.textContent || '';
      if (tx.length >= bestLen) continue;
      if (!tx.includes(label.title)) continue;
      if (label.sub && !tx.includes(label.sub)) continue;
      best = el;
      bestLen = tx.length;
    }
    return best;
  }

  function unfloat() {
    if (!floating || !img) return;
    floating = false;
    Object.assign(img.style, {
      position: '', left: '', bottom: '', transform: '', zIndex: '', margin: '8px auto 0',
    });
  }

  function hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (img) {
      img.style.display = 'none';
      img.remove();
    }
    host = null;
    hostKey = '';
  }

  function show(label, url) {
    if (!label || !url || !doc || !doc.body) {
      hide();
      return;
    }
    const im = ensure();
    if (!im) return;
    // 同じ絵なら読み込み直さない
    if (im.getAttribute('src') !== url) im.setAttribute('src', url);
    const key = `${label.id}|${label.title}|${label.sub || ''}`;
    const stale = !host || host.isConnected === false || key !== hostKey
      || !(host.textContent || '').includes(label.title);
    if (stale) {
      host = null;
      hostKey = key;
      const now = Date.now();
      if (lastMiss.key !== key || now - lastMiss.at > 1000) {
        host = findHost(label);
        if (!host) lastMiss = { key, at: now };
      }
    }
    if (timer) clearTimeout(timer);
    timer = null;
    if (host) {
      unfloat();
      if (im.parentNode !== host) host.append(im);
    } else {
      if (!floating) {
        floating = true;
        Object.assign(im.style, {
          position: 'fixed', left: '50%', bottom: '30%', transform: 'translateX(-50%)', zIndex: '9', margin: '0',
        });
      }
      if (im.parentNode !== doc.body) doc.body.append(im);
      // 札が更新されなくなったら（館を出た等）消す
      timer = setTimeout(hide, 400);
    }
    im.style.display = 'block';
  }

  return { show, hide, element: () => img };
}

let installed = false;

/** 館の仕掛けを入れる（ブラウザでだけ・1回だけ） */
export function installGalleryRuntime(THREE, opts = {}) {
  if (installed) return true;
  if (typeof document === 'undefined' || !THREE) return false;
  installed = true;
  try {
    installDrawingPrep(THREE, opts);
  } catch (err) {
    console.warn('絵の下ごしらえの仕掛けを入れられません:', err);
  }
  try {
    installShaderBrightnessGuard(THREE);
  } catch (err) {
    console.warn('シェーダーの保険を入れられません:', err);
  }
  try {
    const li = createLabelImage();
    setLabelPresenter((label, url) => li.show(label, url));
  } catch (err) {
    console.warn('札の絵を出せません:', err);
  }
  return true;
}
