// 手続きテクスチャ → THREE.CanvasTexture（N64 風：低解像度・バイリニア・繰り返し）。
// モジュールの読み込み時には DOM に触らない。three.js は引数で受け取る。
import { generateTexturePixels, TEXTURE_KINDS, textureRepeat } from './texture-gen.js';

const SEEDS = Object.freeze({
  grass: 11, cobble: 23, brick: 37, planks: 41, sand: 53, water: 67, checker: 79,
});
const SIZES = Object.freeze({ grass: 128, cobble: 128, water: 128 });

let shared = null;

/** 共有のテクスチャ置き場（1回作ったものはキャッシュ） */
export function getTextures(THREE) {
  if (shared && shared.THREE === THREE) return shared;
  shared = createTextureLibrary(THREE);
  return shared;
}

export function createTextureLibrary(THREE) {
  const cache = new Map();

  function base(kind) {
    if (cache.has(kind)) return cache.get(kind);
    const px = generateTexturePixels(kind, SIZES[kind] || 64, SEEDS[kind] ?? 1);
    const c = document.createElement('canvas');
    c.width = px.width;
    c.height = px.height;
    c.getContext('2d').putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    cache.set(kind, tex);
    return tex;
  }

  /** clone して repeat だけ変える */
  function get(kind, { repeat = [1, 1] } = {}) {
    const t = base(kind).clone();
    t.repeat.set(repeat[0] || 1, repeat[1] || 1);
    t.needsUpdate = true;
    return t;
  }

  /** 色味はテクスチャに任せる（白で乗算） */
  function material(kind, opts = {}) {
    return new THREE.MeshLambertMaterial({ map: get(kind, opts), color: new THREE.Color(1, 1, 1) });
  }

  return {
    THREE, kinds: TEXTURE_KINDS, get, material, repeatFor: textureRepeat,
  };
}
