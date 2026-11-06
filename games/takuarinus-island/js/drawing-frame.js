// 新しい絵を額に入れて 3D の壁に掛ける（three.js は引数で受け取る。読み込み時に DOM に触らない）。
// 絵は館と同じ下ごしらえ（線を太らせて縮め、地を紙色・線を濃く）を通して貼る。
import { prepareDrawing } from './drawing-prep.js';
import { fitFrame } from './gallery-data.js';
import { drawingPath } from './drawing-usage.js';
import { PALETTE } from './palette.js';

function prep(THREE, tex) {
  let out = tex;
  const img = tex.image;
  if (img && typeof img.getContext !== 'function' && typeof document !== 'undefined') {
    try {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0) {
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        const g = src.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, w, h);
        const p = prepareDrawing(g.getImageData(0, 0, w, h));
        const c = document.createElement('canvas');
        c.width = p.width;
        c.height = p.height;
        c.getContext('2d').putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
        out = new THREE.CanvasTexture(c);
      }
    } catch (err) {
      console.warn('絵の下ごしらえに失敗（元の画像を使います）:', err);
      out = tex;
    }
  }
  out.colorSpace = THREE.SRGBColorSpace;
  out.magFilter = THREE.LinearFilter;
  out.minFilter = THREE.LinearFilter;
  out.generateMipmaps = false;
  out.needsUpdate = true;
  return out;
}

/** 額入りの絵。正面は +z。返り値 {group, resize(w,h)} */
export function buildDrawingFrame(THREE, file, {
  maxW = 1, maxH = 1, frameColor = PALETTE.frameWood, border = 0.06, depth = 0.04, basic = false,
} = {}) {
  const group = new THREE.Group();
  const picMat = basic
    ? new THREE.MeshBasicMaterial({ color: PALETTE.framePaper })
    : new THREE.MeshLambertMaterial({ color: PALETTE.framePaper });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), picMat);
  pic.position.z = depth / 2 + 0.003;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1, depth), new THREE.MeshLambertMaterial({ color: frameColor }));
  group.add(back, pic);
  const resize = (w, h) => {
    pic.scale.set(w, h, 1);
    back.scale.set(w + 2 * border, h + 2 * border, 1);
  };
  resize(maxW * 0.85, maxH * 0.85);
  try {
    new THREE.TextureLoader().load(
      drawingPath(file),
      (loaded) => {
        const img = loaded.image || {};
        picMat.map = prep(THREE, loaded);
        picMat.color.setRGB(1, 1, 1);
        picMat.needsUpdate = true;
        const iw = img.naturalWidth || img.width || 0;
        const ih = img.naturalHeight || img.height || 0;
        if (iw > 0 && ih > 0) {
          const fr = fitFrame(iw, ih, maxW, maxH);
          resize(fr.width, fr.height);
        }
      },
      undefined,
      () => console.warn('絵を読めません:', file),
    );
  } catch (err) {
    console.warn('絵を読めません:', file, err);
  }
  return { group, resize };
}
