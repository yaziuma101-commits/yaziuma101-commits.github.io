// タイトル画面: スタート / あそびかた / クレジット / データを消す（確認つき）
import { HOWTO_SECTIONS } from '../pause.js';
import { CREDITS_LINES } from '../ending.js';
import { loadStory } from '../story.js';
import { REVIEW_PRESETS, reviewMenuShown } from '../review-save.js';
import { PUBLIC_BUILD } from '../build-flags.js';
import { getLang, saveLang, LANG_LABELS } from '../i18n.js';
import { PALETTE } from '../palette.js';
import { createHeroRig } from '../hero-model.js';
import { createAnimState, stepAnim } from '../characters.js';

// 起動時の演出（依頼者の指摘 2026-11-04: エフェクト・動き・演出・BGM をたっぷり）。
// 空から島へカメラが急降下 → 題字が1文字ずつ落ちてきて光る → メニューが出る。キーでとばせる。
export const TITLE_LAUNCH = Object.freeze({ swoop: 2.6, total: 3.6 });
const FIREWORK_KEYS = Object.freeze(['mohicanRed', 'mohicanYellow', 'mohicanGreen', 'heroMohican', 'uiGold']);
let launchedOnce = false; // ページを読み込んで最初のタイトルだけ演出する

/** 起動の演出のカメラ（t 秒目・ふだんの周回の角度 a）。急降下して周回へつながる */
export function launchCamera(t, a) {
  const orbit = { x: Math.sin(a) * 11, y: 5, z: Math.cos(a) * 11 };
  if (!(t < TITLE_LAUNCH.swoop)) return orbit;
  const k = Math.max(0, t) / TITLE_LAUNCH.swoop;
  const e = 1 - (1 - k) ** 3;
  const r = 34 - 23 * e;
  const ang = a - (1 - e) * 2.4;
  return { x: Math.sin(ang) * r, y: 30 - 25 * e, z: Math.cos(ang) * r };
}

/** あそびかた（全場面の操作の一覧）を container に描く。ポーズ画面でも使う */
export function renderHowto(container) {
  const out = [];
  for (const s of HOWTO_SECTIONS) {
    const box = document.createElement('div');
    box.className = 'howto-section';
    const h = document.createElement('h3');
    h.textContent = s.title;
    const ul = document.createElement('ul');
    for (const [key, desc] of s.rows) {
      const li = document.createElement('li');
      const k = document.createElement('span');
      k.className = 'howto-key';
      k.textContent = key;
      const d = document.createElement('span');
      d.textContent = desc;
      li.append(k, d);
      ul.append(li);
    }
    box.append(h, ul);
    out.push(box);
  }
  container.replaceChildren(...out);
}

/** クレジットを container に描く */
export function renderCredits(container) {
  const lines = [
    ...CREDITS_LINES.filter((s) => s),
    '使用ライブラリ：three.js',
    '音楽・効果音：Web Audio API で合成',
  ];
  container.replaceChildren(...lines.map((s, i) => {
    const p = document.createElement('p');
    p.className = i === 0 ? 'credits-line big' : 'credits-line';
    p.textContent = s;
    return p;
  }));
}

export function createTitleScene(ctx) {
  const { THREE, camera, input } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const root = document.getElementById('title');
  const menuEl = root.querySelector('#title-menu');
  const msgEl = document.getElementById('title-msg');

  // 既存の項目（スタート・データを消す）に役目を付け、あそびかた・クレジットを足す
  [...root.querySelectorAll('#title-menu li')].forEach((li, i) => {
    if (!li.dataset.action) li.dataset.action = i === 0 ? 'start' : 'clear';
  });
  if (menuEl) {
    let search = '';
    try { search = window.location.search; } catch { /* 握りつぶす */ }
    const showReview = reviewMenuShown(search, PUBLIC_BUILD);
    for (const [action, label] of [['opening', 'オープニング'], ['gallery', 'ギャラリー'], ['howto', 'あそびかた'], ['credits', 'クレジット'], ['lang', LANG_LABELS[getLang()]], ['review', '確認用: クリアした状態にする']]) {
      if (action === 'review' && !showReview) continue;
      if (menuEl.querySelector(`li[data-action="${action}"]`)) continue;
      const li = document.createElement('li');
      li.dataset.action = action;
      li.textContent = label;
      const clearLi = menuEl.querySelector('li[data-action="clear"]');
      if (clearLi) menuEl.insertBefore(li, clearLi);
      else menuEl.append(li);
    }
  }
  const items = [...root.querySelectorAll('#title-menu li')];

  let clearEl = document.getElementById('title-clear');
  if (!clearEl) {
    clearEl = document.createElement('p');
    clearEl.id = 'title-clear';
    clearEl.className = 'hidden';
    clearEl.textContent = '★クリア';
    const h1 = root.querySelector('h1');
    if (h1) h1.insertAdjacentElement('afterend', clearEl);
    else root.prepend(clearEl);
  }
  function refreshClear() {
    const on = typeof ctx.isCleared === 'function' && ctx.isCleared();
    clearEl.classList.toggle('hidden', !on);
  }

  // あそびかた・クレジットのパネル
  const infoEl = document.createElement('div');
  infoEl.id = 'title-info';
  infoEl.className = 'info-panel hidden';
  const infoTitle = document.createElement('h2');
  const infoBody = document.createElement('div');
  infoBody.className = 'info-body';
  const infoBack = document.createElement('p');
  infoBack.className = 'title-hint info-back';
  infoBack.textContent = '↑↓: スクロール　Enter/Esc: もどる';
  infoEl.append(infoTitle, infoBody, infoBack);
  if (menuEl) menuEl.insertAdjacentElement('afterend', infoEl);
  else root.append(infoEl);

  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  const fireworks = [];
  let fwIn = 0.4;
  let launchT = TITLE_LAUNCH.total;
  let t = 0;
  let sel = 0;
  let mode = 'menu';
  let active = false;

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(ctx.mat('sky').color);
    world.fog = new THREE.Fog(ctx.mat('sky').color, 14, 40);
    ctx.addLights(world);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(60, 16), ctx.mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    world.add(sea);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 7, 1.2, 16), ctx.mat('sand'));
    sand.position.y = -0.65;
    world.add(sand);
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.7, 1, 16), ctx.mat('grass'));
    grass.position.y = -0.5;
    world.add(grass);
    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6);
    for (const [x, z] of [[-3, -2], [2.6, -2.8], [3.2, 2], [-2.4, 2.8]]) {
      const trunk = new THREE.Mesh(trunkGeo, ctx.mat('trunk'));
      trunk.position.set(x, 0.6, z);
      const leaf = new THREE.Mesh(leafGeo, ctx.mat('leaf'));
      leaf.position.set(x, 1.7, z);
      world.add(trunk, leaf);
    }
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 0.8, 8), ctx.mat('pedestal'));
    ped.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 8), ctx.mat('pedestalTop'));
    top.position.y = 0.9;
    world.add(ped, top);
    // 台の上でタクアリヌスが跳ねる
    hero = createHeroRig(THREE, ctx.mat);
    hero.root.position.set(0, 1, 0);
    world.add(hero.root);
  }

  /** 花火を1発（島のまわりから打ち上げ、空で色とりどりに弾ける） */
  function launchFirework() {
    const key = FIREWORK_KEYS[Math.floor(Math.random() * FIREWORK_KEYS.length)];
    const material = new THREE.MeshBasicMaterial({ color: PALETTE[key], transparent: true });
    const g = new THREE.Group();
    const a = Math.random() * Math.PI * 2;
    g.position.set(Math.sin(a) * (4 + Math.random() * 6), 6 + Math.random() * 5, Math.cos(a) * (4 + Math.random() * 6));
    const parts = [];
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, material);
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      parts.push({ m, v: { x: s * Math.cos(th) * 4.5, y: u * 4.5 + 1, z: s * Math.sin(th) * 4.5 } });
      g.add(m);
    }
    world.add(g);
    fireworks.push({ g, parts, material, life: 0 });
    sfx('jump');
  }

  function stepFireworks(dt) {
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i];
      f.life += dt;
      for (const p of f.parts) {
        p.v.y -= 3.2 * dt;
        p.m.position.x += p.v.x * dt;
        p.m.position.y += p.v.y * dt;
        p.m.position.z += p.v.z * dt;
        p.m.rotation.x += dt * 6;
      }
      f.material.opacity = Math.max(0, 1 - f.life / 1.6);
      if (f.life > 1.6) {
        world.remove(f.g);
        f.material.dispose();
        fireworks.splice(i, 1);
      }
    }
  }

  function endLaunch() {
    launchT = TITLE_LAUNCH.total;
    root.classList.remove('tl-launch');
  }

  function renderMenu() {
    items.forEach((li, i) => li.classList.toggle('selected', i === sel));
  }
  function setMsg(s) {
    if (msgEl.textContent !== s) msgEl.textContent = s;
  }
  function openInfo(kind) {
    mode = 'info';
    setMsg('');
    if (kind === 'credits') {
      infoTitle.textContent = 'クレジット';
      infoBody.classList.add('credits-body');
      renderCredits(infoBody);
    } else {
      infoTitle.textContent = 'あそびかた';
      infoBody.classList.remove('credits-body');
      renderHowto(infoBody);
    }
    infoBody.scrollTop = 0;
    if (menuEl) menuEl.classList.add('hidden');
    infoEl.classList.remove('hidden');
    root.classList.add('info-open');
  }
  function closeInfo() {
    mode = 'menu';
    infoEl.classList.add('hidden');
    root.classList.remove('info-open');
    if (menuEl) menuEl.classList.remove('hidden');
    renderMenu();
  }
  function activate() {
    const action = items[sel] ? items[sel].dataset.action : 'start';
    if (action === 'start') {
      // 初めてのときはオープニングから（見終わると島へ）
      const seen = loadStory(ctx.storage).openingSeen;
      if (!seen && ctx.goto('opening', {})) return;
      ctx.goto('hub', {});
    } else if (action === 'opening') {
      ctx.goto('opening', {});
    } else if (action === 'gallery') {
      sfx('confirm');
      ctx.goto('gallerymode', {});
    } else if (action === 'lang') {
      // 言語を切り替えて保存し、読み込み直す（3D の看板の文字も作り直すため）
      sfx('confirm');
      saveLang(ctx.storage, getLang() === 'ja' ? 'en' : 'ja');
      try { window.location.reload(); } catch { /* 握りつぶす */ }
    } else if (action === 'review') {
      sfx('confirm');
      mode = 'review';
      setMsg(`${REVIEW_PRESETS.map((p, i) => `${i + 1}: ${p.label}`).join(' ／ ')} ／ Esc: もどる`);
    } else if (action === 'howto' || action === 'credits') {
      sfx('confirm');
      openInfo(action);
    } else {
      mode = 'confirm';
      setMsg('本当に消しますか？ Enter=はい / Esc=いいえ');
    }
  }

  items.forEach((li, i) => {
    li.addEventListener('click', () => {
      if (!active || mode !== 'menu') return;
      sel = i;
      renderMenu();
      activate();
    });
  });
  infoBack.addEventListener('click', () => {
    if (active && mode === 'info') closeInfo();
  });

  return {
    enter() {
      if (!world) build();
      ctx.setWorld(world);
      active = true;
      mode = 'menu';
      sel = 0;
      setMsg('');
      infoEl.classList.add('hidden');
      root.classList.remove('info-open');
      if (menuEl) menuEl.classList.remove('hidden');
      renderMenu();
      refreshClear();
      root.classList.remove('hidden');
      ctx.ui.setHint('');
      // 最初の1回だけ、起動の演出（題字が落ちてくる CSS の .tl-launch）
      if (!launchedOnce) {
        launchedOnce = true;
        launchT = 0;
        fwIn = 1.4;
        root.classList.remove('tl-launch');
        void root.offsetWidth; // 演出をやり直させる
        root.classList.add('tl-launch');
      } else {
        endLaunch();
      }
    },
    update(dt) {
      t += dt;
      const a = t * 0.25;
      const wasLaunching = launchT < TITLE_LAUNCH.total;
      launchT = Math.min(TITLE_LAUNCH.total, launchT + dt);
      const cam = launchCamera(launchT, a);
      camera.position.set(cam.x, cam.y + Math.sin(t * 0.7) * 0.4, cam.z);
      camera.lookAt(0, 0.8, 0);
      // 花火: 起動の題字がそろった瞬間に3発、そのあとはときどき
      if (wasLaunching && launchT >= 1.6 && launchT - dt < 1.6) {
        for (let i = 0; i < 3; i++) launchFirework();
        sfx('mohawkGet');
      }
      fwIn -= dt;
      if (fwIn <= 0) {
        fwIn = 0.9 + Math.random() * 1.6;
        launchFirework();
      }
      stepFireworks(dt);
      // タクアリヌス: 台の上でぴょんぴょん跳ねて、ときどきくるっと回る
      if (hero) {
        const hop = Math.abs(Math.sin(t * 2.6));
        hero.root.position.y = 1 + hop * 0.9;
        hero.root.rotation.y = Math.floor(t / 4) % 2 ? (t % 4) * Math.PI * 0.5 : Math.atan2(cam.x, cam.z);
        stepAnim(heroAnim, { moving: false, airborne: hop > 0.15, dt });
        hero.apply(heroAnim);
      }
      if (wasLaunching && launchT < TITLE_LAUNCH.total) {
        // 起動の演出の途中: キーでとばす（同じ Enter でスタートしないよう、ここで止める）
        if (input.wasPressed('Enter', 'NumpadEnter', 'Space', 'Escape')) endLaunch();
        return;
      }
      if (wasLaunching) endLaunch();

      if (mode === 'info') {
        if (input.wasPressed('Enter', 'NumpadEnter', 'Escape', 'Backspace')) {
          closeInfo();
          return;
        }
        if (input.wasPressed('ArrowUp', 'KeyW')) infoBody.scrollTop -= 60;
        if (input.wasPressed('ArrowDown', 'KeyS')) infoBody.scrollTop += 60;
        return;
      }
      if (mode === 'review') {
        const keys = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
        const k = keys.findIndex((codes) => input.wasPressed(...codes));
        if (k >= 0 && REVIEW_PRESETS[k]) {
          const ok = typeof ctx.applyReviewSave === 'function' && ctx.applyReviewSave(REVIEW_PRESETS[k].id);
          refreshClear();
          mode = 'menu';
          setMsg(ok ? `「${REVIEW_PRESETS[k].label}」にしました。スタートで島へ` : '保存できませんでした');
        } else if (input.wasPressed('Escape', 'Backspace')) {
          mode = 'menu';
          setMsg('');
        }
        return;
      }
      if (mode === 'confirm') {
        if (input.wasPressed('Enter', 'NumpadEnter')) {
          const done = ctx.clearData() !== false;
          refreshClear();
          mode = 'menu';
          setMsg(done ? 'データを消しました' : 'データを消せませんでした');
        } else if (input.wasPressed('Escape')) {
          mode = 'menu';
          setMsg('');
        }
        return;
      }
      if (input.wasPressed('ArrowUp', 'KeyW')) {
        sel = (sel + items.length - 1) % items.length;
        renderMenu();
        setMsg('');
      }
      if (input.wasPressed('ArrowDown', 'KeyS')) {
        sel = (sel + 1) % items.length;
        renderMenu();
        setMsg('');
      }
      if (input.wasPressed('Enter', 'NumpadEnter')) activate();
    },
    exit() {
      active = false;
      mode = 'menu';
      infoEl.classList.add('hidden');
      root.classList.remove('info-open');
      if (menuEl) menuEl.classList.remove('hidden');
      root.classList.add('hidden');
    },
  };
}
