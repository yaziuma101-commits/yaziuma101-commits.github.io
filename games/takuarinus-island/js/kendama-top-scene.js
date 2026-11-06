// 見下ろし型けん玉の場面（three.js）。文字は HTML で重ねる。
import { PALETTE } from './palette.js';
import { chargePreviewText, catchPopText } from './kendama-height-points.js';
import {
  createTopGame, stepGame, isFinished, topResult, screenBlock, ballHeight, MATCH_SEC, ARENA, CAMERA_Y, CATCH_RADIUS, heightFromCharge,
} from './kendama-top-rules.js';
import { createHeroRig } from './hero-model.js';
import { buildFace, createAnimState, stepAnim } from './characters.js';
import {
  extraSfx, gameCharge, ensureGameMusic, stopGameMusic,
} from './audio.js';
import { kendamaItemOptions, kendamaWindowScale, kendamaTopDrift } from './item-effects.js';
import {
  el, addStyle, createMenu, carryInfo, toGallery, grantItem, grantedLine,
} from './phase4-ui.js';
import { smokeSummary } from './smoke-state.js';

const GAME_ID = 'kendama';
const CSS = `
#kendama-top-root{position:fixed;inset:0;z-index:5;pointer-events:none}
#kendama-top-root .p4-menu,#kendama-top-root .kd-top-menu{pointer-events:auto}
.kd-top-hud{position:absolute;left:50%;top:10px;transform:translateX(-50%);padding:6px 18px;background:var(--p-uiPanel);color:var(--p-uiText);border:3px solid var(--p-uiShade);border-radius:14px;font-weight:bold;font-size:18px;white-space:nowrap}
.kd-top-block{position:absolute;left:50%;top:50%;width:150vmax;height:150vmax;border-radius:50%;transform:translate(-50%,-50%) scale(0);background:radial-gradient(circle at 35% 30%,pink,crimson 45%,darkred 75%);opacity:0}
.kd-top-gauge{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);width:260px;height:18px;border:3px solid var(--p-uiShade);border-radius:10px;background:var(--p-uiPanel);overflow:hidden}
.kd-top-fill{height:100%;width:0;background:var(--p-mohicanRed)}
.kd-top-guide{position:absolute;top:0;bottom:0;left:60%;width:3px;background:var(--p-uiAccent)}
.kd-top-help{position:absolute;left:50%;bottom:46px;transform:translateX(-50%);font-size:14px;padding:2px 10px;background:var(--p-uiPanel);border-radius:8px;color:var(--p-uiText);white-space:nowrap}
`;

export function kendamaTopIntroLines(carryLine) {
  return [
    '広い庭でさんかくアリヌスとけん玉勝負！ 玉を高く上げて、落ちてくるところで受け止めよう。',
    'WASD：移動　Space 長押し→離す：玉を真上に上げる（長いほど高い）　J：体当たり',
    '高く上げた玉はカメラに近づいて画面をふさぐ。そのすきに体当たりで相手を吹き飛ばせ！',
    '影の位置で落ちる瞬間に受ければ得点（高いほど高得点）。外すとズコー。',
    `勝ち方：${MATCH_SEC}秒の合計点が多いほうの勝ち。`,
    { text: carryLine || '持ち込み：なし', cls: 'p4-item' },
    'Enter / Space で始める　Esc で館に戻る',
  ];
}

function groundTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.grass; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) {
    const h = Math.imul(i + 7, 2654435761) >>> 0;
    g.fillStyle = (h & 1) ? PALETTE.grassDark : PALETTE.leaf;
    g.fillRect(h % 64, (h >>> 8) % 64, 1, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

export function createKendamaTopScene(ctxArg = {}) {
  let ctx = ctxArg;
  let world = null; let heroRig = null; let ally = null; const balls = []; const shadows = [];
  const anim = createAnimState();
  let root = null; let hud; let blockEl; let gauge; let fill; let guideEl; let help; let menu = null;
  const keys = new Set(); const pressed = new Set();
  let hardFoe = false; // 高難易度: 相手がいちばん強い段
  let phase = 'howto'; let game = null; let opts = {}; let carryLine = ''; let guard = 0; let playT = 0;

  const onDown = (e) => {
    if (!root) return;
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  };
  const onUp = (e) => keys.delete(e.code);

  function build() {
    const { THREE, mat } = ctx;
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 25, 60);
    ctx.addLights(world);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ map: groundTexture(THREE) }));
    ground.rotation.x = -Math.PI / 2;
    const gravel = new THREE.Mesh(new THREE.RingGeometry(ARENA, ARENA + 1.5, 32), mat('pedestal'));
    gravel.rotation.x = -Math.PI / 2; gravel.position.y = 0.01;
    world.add(ground, gravel);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), mat('leaf'));
      tree.position.set(Math.cos(a) * (ARENA + 4), 1.4, Math.sin(a) * (ARENA + 4));
      world.add(tree);
    }
    heroRig = createHeroRig(THREE, mat);
    world.add(heroRig.root);
    ally = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 3), new THREE.MeshLambertMaterial({ color: PALETTE.kdAllyBody }));
    body.position.y = 0.9;
    const face = buildFace(THREE, mat);
    face.position.set(0, 0.8, 0.42);
    face.scale.setScalar(1.6);
    ally.add(body, face);
    world.add(ally);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshLambertMaterial({ color: PALETTE.kdBall }));
      b.visible = false;
      const s = ctx.makeShadow(1.2);
      s.material = s.material.clone();
      s.visible = false;
      world.add(b, s);
      balls.push(b); shadows.push(s);
    }
  }

  function clearMenu() { if (menu) { menu.remove(); menu = null; } }

  function showIntro() {
    clearMenu();
    phase = 'howto';
    menu = createMenu(root, { title: 'けん玉ケンケン', lines: kendamaTopIntroLines(carryLine) }, () => {});
  }

  function startMatch() {
    clearMenu();
    let scale = 1;
    // 受けはけん先1つの見下ろし型なので、けん先の倍率（ナス駒）も掛ける
    try { scale = Number(kendamaWindowScale(opts, 'kensaki')) || 1; } catch { scale = 1; }
    playT = 0;
    game = createTopGame({
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
      strength: hardFoe ? 3 : 2,
      catchRadius: CATCH_RADIUS * scale,
      chargeRate: Number(opts.chargeRate) > 0 ? opts.chargeRate : 1,
    });
    phase = 'play';
    for (const e of [hud, gauge, help]) e.classList.remove('hidden');
    guideEl.classList.toggle('hidden', !opts.chargeGuide);
  }

  function finish() {
    phase = 'result';
    gameCharge(null);
    for (const e of [hud, gauge, help]) e.classList.add('hidden');
    blockEl.style.opacity = '0';
    const r = topResult(game);
    const lines = [`あなた ${game.scores.hero}点 − ${game.scores.ally}点 さんかくアリヌス`];
    if (carryLine) lines.push(carryLine);
    if (r === 'win') {
      const line = grantedLine(grantItem(ctx, GAME_ID), 'ふしぎなけん玉');
      if (line) lines.push(line);
      extraSfx('correct');
    }
    menu = createMenu(root, {
      title: r === 'win' ? '勝ち！' : r === 'lose' ? '負け…' : '引き分け',
      lines,
      choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
    }, (id) => (id === 'again' ? startMatch() : toGallery(ctx, GAME_ID)));
  }

  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'catch') { extraSfx(e.h > 12 ? 'shakin' : 'katsun'); if (e.who === 'hero') ctx.ui.toast(`キャッチ！ ${catchPopText(e.h)}`, 1.4); }
      else if (e.type === 'miss') { extraSfx('sukat'); if (e.who === 'hero') ctx.ui.toast('ズコー', 1); }
      else if (e.type === 'tackle') { extraSfx('sukat'); ctx.ui.toast(e.who === 'hero' ? 'ドーン！ 吹き飛ばした' : '吹き飛ばされた！', 1); }
    }
  }

  function sync(dt) {
    if (!game) return;
    const h = game.players.hero; const a = game.players.ally;
    heroRig.root.position.set(h.x, 0, h.z);
    if (Math.hypot(h.vx, h.vz) > 0.1) heroRig.root.rotation.y = Math.atan2(h.vx, h.vz);
    stepAnim(anim, { moving: Math.hypot(h.vx, h.vz) > 0.1, dt });
    heroRig.apply(anim);
    ally.position.set(a.x, 0, a.z);
    ally.rotation.y = Math.atan2(h.x - a.x, h.z - a.z);
    const cover = screenBlock(game, 'hero');
    ally.visible = cover < 0.5;
    ['hero', 'ally'].forEach((who, i) => {
      const p = game.players[who];
      const b = p.ball;
      balls[i].visible = !!b;
      shadows[i].visible = !!b;
      if (b) {
        balls[i].position.set(b.x, ballHeight(b.h, b.t) + 0.4, b.z);
        shadows[i].position.set(b.x, 0.03, b.z);
        shadows[i].material.opacity = 0.1 + 0.6 * Math.min(1, b.t / b.total);
      }
    });
    const cam = ctx.camera;
    cam.position.set(h.x, CAMERA_Y, h.z + 7);
    cam.lookAt(h.x, 0, h.z);
    blockEl.style.opacity = String(Math.min(1, cover * 1.4));
    blockEl.style.transform = `translate(-50%,-50%) scale(${cover})`;
    fill.style.width = `${Math.round(h.charge * 100)}%`;
    const head = `残り ${Math.ceil(MATCH_SEC - game.time)}秒　あなた ${game.scores.hero} − ${game.scores.ally} さんかく`;
    // 溜めている間は、上がる高さと得点の目安を出す
    hud.textContent = h.charging ? `${head}　｜　${chargePreviewText(h.charge, heightFromCharge)}` : head;
  }

  const scene = {
    name: 'kendama',
    enter(a, b) {
      let params = a;
      if (a && (typeof a.goto === 'function' || typeof a.returnToGallery === 'function')) { ctx = a; params = b; }
      params = params || {};
      if (!world) build();
      ctx.setWorld(world);
      const ci = carryInfo(ctx, GAME_ID, params.carry || params.carryResult);
      opts = kendamaItemOptions(ci.params) || {};
      hardFoe = !!(ci.params && ci.params.hard);
      carryLine = ci.line;
      addStyle('kendama-top-style', CSS);
      root = el('div'); root.id = 'kendama-top-root';
      hud = el('div', 'kd-top-hud hidden');
      blockEl = el('div', 'kd-top-block');
      gauge = el('div', 'kd-top-gauge hidden'); fill = el('div', 'kd-top-fill'); guideEl = el('div', 'kd-top-guide hidden');
      gauge.append(fill, guideEl);
      help = el('div', 'kd-top-help hidden', 'WASD移動　Space溜め→離して上げる　J体当たり　Escポーズ');
      root.append(blockEl, hud, gauge, help);
      document.body.appendChild(root);
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
      guard = 0.4;
      game = createTopGame({});
      showIntro();
      sync(0);
    },
    update(dt) {
      if (!root) return;
      const d = Math.min(0.05, Number.isFinite(dt) && dt > 0 ? dt : 0);
      guard = Math.max(0, guard - d);
      ensureGameMusic('kendama');
      if (phase === 'howto') {
        if (guard <= 0 && (pressed.has('Enter') || pressed.has('Space'))) startMatch();
        else if (pressed.has('Escape')) toGallery(ctx, GAME_ID);
      } else if (phase === 'play') {
        const k = (...c) => c.some((x) => keys.has(x));
        const inp = {
          // 動く箱を持ち込むと、箱につられて手が左右にゆっくり流される
          mx: Math.max(-1, Math.min(1, (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + kendamaTopDrift(opts, playT))),
          mz: (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0),
          charging: keys.has('Space'),
          tackle: pressed.has('KeyJ'),
        };
        playT += d;
        game = stepGame(game, d, { hero: inp });
        gameCharge(game.players.hero.charging ? game.players.hero.charge : null);
        handleEvents();
        if (isFinished(game)) finish();
      } else if (phase === 'result' && menu) {
        for (const c of pressed) menu.key(c);
      }
      pressed.clear();
      sync(d);
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t: playT, game: smokeSummary(game), opts: smokeSummary(opts) };
    },
    exit() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      gameCharge(null);
      stopGameMusic('kendama');
      if (root) root.remove();
      root = null; menu = null;
      keys.clear(); pressed.clear();
    },
  };
  scene.start = scene.enter; scene.stop = scene.exit; scene.tick = scene.update; scene.dispose = scene.exit;
  return scene;
}

export default createKendamaTopScene;
