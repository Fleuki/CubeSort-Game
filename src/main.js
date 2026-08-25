// Точка входа: игровой цикл, ввод и склейка модулей.
// Тайминги — из раздела 6 дизайн-дока, менять только вместе с ним.

import { LEVELS } from '../levels/levels.js';
import { createState } from './game/state.js';
import { takeTopGroup, canMove, applyMove, isSolved, isPostComplete, stars } from './game/rules.js';
import { generateLevel } from './game/generator.js';
import { findHint, findOptimal } from './game/solver.js';
import { createHistory, pushHistory, popHistory, canUndo, clearHistory } from './game/history.js';
import { computeLayout, hitTest, slotPosition } from './render/layout.js';
import { drawScene } from './render/scene.js';
import { createCity, prepareBuilding, commitBuilding, resetCity, drawBuilding, snapshotCity, restoreCity, completedDistrict, lightingOrder, lightBuilding, cameraTarget, setCameraStage, syncCamera, rebuildCity, countColumns, CITY_SCHEMA_VERSION } from './render/city.js';
import { createTweenPool, addTween, updateTweens, isBusy, EASING, setTimeScale } from './anim/tween.js';
import { createFx, updateFx, spawnSplinters, shakeCamera } from './anim/fx.js';
import * as sfx from './audio/sfx.js';
import { createHud, FREE_UNDO, FREE_HINTS } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createDebug } from './ui/debug.js';
import * as platform from './platform/sdk.js';

const LIFT_MS = 120;
const BOB_AMPLITUDE = 3;
const BOB_PERIOD = 1600;
const FLIGHT_BASE_MS = 180;
const FLIGHT_PER_CUBE_MS = 25;
const ARC_HEIGHT = 70;
const LAND_MS = 90;
const SQUASH_MS = 110;
const SQUASH_FROM = 0.88;
const DENY_MS = 220;
const DENY_CYCLES = 3;
const DENY_AMPLITUDE = 5;
const WAVE_STEP_MS = 55;
const HOUSE_MS = 320;
const TRANSITION_MS = 550;
const HINT_SHOW_MS = 3200;
const WINDOW_STEP_MS = 60;
const CAMERA_MS = 700;
const VIBRO_TAKE = 8;
const VIBRO_PLACE = 12;
const VIBRO_COMPLETE = 30;
const PENDING_LIMIT = 2;
const MAX_DELTA = 50;
const MAX_DPR = 2;
const LOOSE_LEVEL_NODES = 25000;
const PAR_MAX_DEPTH = 20;
const INEXACT_PAR_FACTOR = 0.8;
const LEVEL_SEED_BASE = 7919;
const LEVEL_SEED_OFFSET = 13;

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });

const app = {
  screen: 'loading',
  dpr: 1,
  layout: null,
  level: 1,
  state: null,
  history: createHistory(),
  city: createCity(),
  fx: createFx(),
  tweens: createTweenPool(),
  hand: null,
  flight: null,
  hidden: null,
  landing: null,
  wave: null,
  shake: null,
  hint: null,
  pending: [],
  hintPulse: 0,
  hintUntil: 0,
  cityAppear: null,
  fade: 0,
  busy: false,
  paused: false,
  time: 0,
  undoUsed: 0,
  hintsUsed: 0,
  extraPostUsed: false,
  settings: { muted: false, vibro: true },
  progress: { level: 1 }
};

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) {
  setTimeScale(0.4);
  app.fx.reducedMotion = true;
}

const hud = createHud({
  undo: () => requestUndo(),
  hint: () => requestHint(),
  post: () => requestExtraPost(),
  settings: () => screens.showSettings(app.settings, app.screen === 'game'),
  menu: () => openMenu()
});

const debug = createDebug();

const screens = createScreens({
  play: () => startGame(),
  next: () => nextLevel(),
  openSettings: () => screens.showSettings(app.settings, app.screen === 'game'),
  closeSettings: () => {
    screens.hideSettings();
    persist();
  },
  restart: () => {
    screens.hideSettings();
    restartLevel();
  },
  toggleSound: () => {
    app.settings.muted = !app.settings.muted;
    sfx.setMuted(app.settings.muted);
    screens.showSettings(app.settings, app.screen === 'game');
  },
  toggleVibro: () => {
    app.settings.vibro = !app.settings.vibro;
    screens.showSettings(app.settings, app.screen === 'game');
  },
  resetProgress: () => {
    app.progress.level = 1;
    app.level = 1;
    resetCity(app.city);
    persist();
    screens.hideSettings();
    openMenu();
  }
});

function vibrate(ms) {
  if (!app.settings.vibro || !navigator.vibrate) return;
  navigator.vibrate(ms);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Выше 2x бюджетные телефоны не тянут.
  app.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(width * app.dpr);
  canvas.height = Math.round(height * app.dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  rebuildLayout(width, height);
}

function rebuildLayout(width, height) {
  const postCount = app.state ? app.state.posts.length : 5;
  const capacity = app.state ? app.state.capacity : 4;
  app.layout = computeLayout(
    width || window.innerWidth,
    height || window.innerHeight,
    postCount,
    capacity
  );
  app.city.dirty = true;
}

// Уровни после 60-го считаются на лету — один раз при старте уровня,
// а не на каждый ход. par считается так же, как в офлайн-генераторе.
function levelData(id) {
  if (id <= LEVELS.length) return LEVELS[id - 1];
  const level = generateLevel(id, (id * LEVEL_SEED_BASE + LEVEL_SEED_OFFSET) >>> 0);
  const optimal = findOptimal(level.posts, level.capacity, PAR_MAX_DEPTH, LOOSE_LEVEL_NODES);
  return {
    id,
    capacity: level.capacity,
    colors: level.colors,
    posts: level.posts,
    parMoves: optimal === null ? Math.max(1, Math.round(level.parMoves * INEXACT_PAR_FACTOR)) : optimal
  };
}

function startLevel(id) {
  app.level = id;
  app.state = createState(levelData(id));
  clearHistory(app.history);
  app.hand = null;
  app.flight = null;
  app.hidden = null;
  app.landing = null;
  app.wave = null;
  app.shake = null;
  app.hint = null;
  app.pending.length = 0;
  app.cityAppear = null;
  app.busy = false;
  app.undoUsed = 0;
  app.hintsUsed = 0;
  app.extraPostUsed = false;
  sfx.resetCombo();
  rebuildLayout();
  updateHud();
  hud.setLevel(id);
  platform.gameplayStart();
}

function updateHud() {
  if (app.state) hud.setGoal(app.state.moves, app.state.parMoves);
  hud.update({
    undoUsed: app.undoUsed,
    hintsUsed: app.hintsUsed,
    extraPostUsed: app.extraPostUsed,
    canUndo: canUndo(app.history)
  });
}

function startGame() {
  app.screen = 'game';
  screens.hideAll();
  hud.show();
  startLevel(app.progress.level);
}

function openMenu() {
  app.screen = 'menu';
  platform.gameplayStop();
  hud.hide();
  screens.showMenu(app.progress.level);
}

function restartLevel() {
  if (app.busy) return;
  startLevel(app.level);
}

// --- ходы -----------------------------------------------------------------

function onTap(index) {
  if (app.screen !== 'game' || index < 0) return;
  // Тапы во время анимации не теряются, а ждут её конца: иначе быстрая
  // серия ходов ощущается как «не нажалось». Очередь короткая — двух
  // хватает на пару «взял — положил», больше копить вредно.
  if (app.busy) {
    if (app.pending.length < PENDING_LIMIT) app.pending.push(index);
    return;
  }
  app.hint = null;
  if (!app.hand) {
    takeGroup(index);
    return;
  }
  if (index === app.hand.from) {
    returnGroup();
    return;
  }
  if (canMove(app.state.posts, app.hand.from, index, app.state.capacity)) {
    startFlight(index);
  } else {
    denyMove(index);
  }
}

function takeGroup(index) {
  const group = takeTopGroup(app.state.posts, index);
  if (!group) return;
  app.hand = { from: index, color: group.color, count: group.count, lift: 0, bob: 0 };
  addTween(app.tweens, {
    duration: LIFT_MS,
    easing: EASING.easeOutQuad,
    onUpdate: (t) => {
      if (app.hand) app.hand.lift = t;
    }
  });
  sfx.playTake();
  vibrate(VIBRO_TAKE);
}

function returnGroup() {
  const hand = app.hand;
  if (!hand) return;
  app.busy = true;
  addTween(app.tweens, {
    duration: LIFT_MS,
    easing: EASING.easeOutQuad,
    onUpdate: (t) => {
      if (app.hand) app.hand.lift = 1 - t;
    },
    onDone: () => {
      app.hand = null;
      app.busy = false;
    }
  });
}

function denyMove(index) {
  sfx.playDeny();
  app.busy = true;
  const started = app.time;
  addTween(app.tweens, {
    duration: DENY_MS,
    onUpdate: (t) => {
      const decay = 1 - t;
      app.shake = {
        index,
        offset: Math.sin(t * Math.PI * 2 * DENY_CYCLES) * DENY_AMPLITUDE * decay
      };
    },
    onDone: () => {
      app.shake = null;
      app.busy = false;
    }
  });
  return started;
}

function startFlight(to) {
  const hand = app.hand;
  const from = hand.from;
  const count = hand.count;
  const color = hand.color;
  const layout = app.layout;
  const baseSlot = app.state.posts[from].length - count;

  pushHistory(app.history, {
    posts: app.state.posts,
    city: snapshotCity(app.city),
    moves: app.state.moves
  });

  const start = slotPosition(layout, from, baseSlot);
  const startY = start.y - hand.lift * layout.size * 1.5;
  const end = slotPosition(layout, to, app.state.posts[to].length);
  const peak = Math.min(startY, end.y) - ARC_HEIGHT;

  app.hand = null;
  app.hidden = { post: from, count };
  app.busy = true;
  app.flight = { color, count, x: start.x, y: startY, groundY: layout.posts[to].baseY };

  addTween(app.tweens, {
    duration: FLIGHT_BASE_MS + FLIGHT_PER_CUBE_MS * (count - 1),
    easing: EASING.easeInOutQuad,
    onUpdate: (t) => {
      const x = start.x + (end.x - start.x) * t;
      // Парабола через три точки: старт, вершина дуги, посадка.
      const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * peak + t * t * end.y;
      app.flight.x = x;
      app.flight.y = y;
    },
    onDone: () => finishFlight(from, to, count, color, end)
  });
}

function finishFlight(from, to, count, color, end) {
  app.state.posts = applyMove(app.state.posts, from, to, app.state.capacity);
  app.state.moves += 1;
  app.flight = null;
  app.hidden = null;

  const landedFrom = app.state.posts[to].length - count;
  app.landing = { post: to, fromSlot: landedFrom, squash: SQUASH_FROM };
  addTween(app.tweens, {
    duration: SQUASH_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      if (app.landing) app.landing.squash = SQUASH_FROM + (1 - SQUASH_FROM) * t;
    },
    onDone: () => {
      app.landing = null;
    }
  });

  spawnSplinters(app.fx, end.x, end.y, color);
  sfx.playPlace();
  vibrate(VIBRO_PLACE);
  updateHud();

  if (isPostComplete(app.state.posts[to], app.state.capacity)) {
    completePost(to, color);
    return;
  }
  addTween(app.tweens, {
    duration: LAND_MS,
    onDone: () => {
      app.busy = false;
      checkWin();
    }
  });
}

function completePost(index, color) {
  sfx.playComplete();
  vibrate(VIBRO_COMPLETE);
  shakeCamera(app.fx);
  const waveDuration = WAVE_STEP_MS * (app.state.capacity + 2);
  app.wave = { post: index, t: 0 };
  addTween(app.tweens, {
    duration: waveDuration,
    onUpdate: (t) => {
      if (app.wave) app.wave.t = t * (app.state.capacity + 1);
    },
    onDone: () => {
      app.wave = null;
    }
  });

  // На заполненной площадке новая постройка не добавляется — этаж
  // получает существующее здание, анимация та же.
  const pending = prepareBuilding(app.city, color, app.level);
  app.cityAppear = {
    t: 0,
    draw(target, rect) {
      drawBuilding(target, rect, app.city, pending, this.t);
    }
  };
  addTween(app.tweens, {
    duration: HOUSE_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      if (app.cityAppear) app.cityAppear.t = t;
    },
    onDone: () => {
      app.cityAppear = null;
      commitBuilding(app.city, pending);
      persist();
      const district = completedDistrict(app.city);
      if (district >= 0) {
        lightDistrict(district);
        return;
      }
      app.busy = false;
      checkWin();
    }
  });
}

// Район завершён: окна загораются волной слева направо. Свет остаётся
// навсегда, фон при этом не меняется.
function lightDistrict(district) {
  const order = lightingOrder(app.city, app.layout.city, district);
  if (order.length === 0) {
    moveCamera();
    return;
  }
  let lit = 0;
  addTween(app.tweens, {
    duration: WINDOW_STEP_MS * order.length,
    onUpdate: (t) => {
      const target = Math.min(order.length, Math.floor(t * order.length) + 1);
      while (lit < target) {
        lightBuilding(app.city, order[lit]);
        lit += 1;
      }
    },
    onDone: () => {
      while (lit < order.length) {
        lightBuilding(app.city, order[lit]);
        lit += 1;
      }
      persist();
      moveCamera();
    }
  });
}

// Камера отъезжает ступенью — после волны окон, а не вместе с ней:
// плавный отъезд на каждый дом читался бы как убывание города.
function moveCamera() {
  const from = app.city.stage;
  const to = cameraTarget(app.city);
  if (Math.abs(to - from) < 0.001) {
    app.busy = false;
    checkWin();
    return;
  }
  addTween(app.tweens, {
    duration: CAMERA_MS,
    easing: EASING.easeInOutCubic,
    onUpdate: (t) => {
      setCameraStage(app.city, from + (to - from) * t);
    },
    onDone: () => {
      setCameraStage(app.city, to);
      app.busy = false;
      checkWin();
    }
  });
}

function checkWin() {
  if (!isSolved(app.state.posts, app.state.capacity)) return;
  app.busy = true;
  platform.gameplayStop();
  sfx.playWin();
  app.progress.level = app.level + 1;
  persist();
  addTween(app.tweens, {
    duration: 420,
    onDone: () => {
      app.screen = 'win';
      hud.hide();
      screens.showWin({
        stars: stars(app.state.moves, app.state.parMoves),
        moves: app.state.moves,
        cityCount: app.city.buildings.length
      });
      app.busy = false;
    }
  });
}

async function nextLevel() {
  screens.hideAll();
  // Реклама только между уровнями и только когда ничего не анимируется.
  if (platform.canShowInterstitial(app.level)) {
    sfx.setMuted(true);
    await platform.showInterstitial(app.level);
    sfx.setMuted(app.settings.muted);
  }
  app.screen = 'game';
  hud.show();
  fadeTransition(() => startLevel(app.progress.level));
}

function fadeTransition(action) {
  app.busy = true;
  addTween(app.tweens, {
    duration: TRANSITION_MS / 2,
    easing: EASING.easeInOutCubic,
    onUpdate: (t) => {
      app.fade = t;
    },
    onDone: () => {
      action();
      addTween(app.tweens, {
        duration: TRANSITION_MS / 2,
        easing: EASING.easeInOutCubic,
        onUpdate: (t) => {
          app.fade = 1 - t;
        },
        onDone: () => {
          app.fade = 0;
          app.busy = false;
        }
      });
    }
  });
}

// --- помощь ---------------------------------------------------------------

async function requestUndo() {
  if (app.busy || !canUndo(app.history)) return;
  if (app.undoUsed >= FREE_UNDO && !(await earnReward())) return;
  const snapshot = popHistory(app.history);
  if (!snapshot) return;
  app.state.posts = snapshot.posts;
  app.state.moves = snapshot.moves;
  restoreCity(app.city, snapshot.city);
  app.hand = null;
  app.hidden = null;
  app.undoUsed += 1;
  sfx.playTake();
  updateHud();
  persist();
}

async function requestHint() {
  if (app.busy) return;
  if (app.hintsUsed >= FREE_HINTS && !(await earnReward())) return;
  const move = findHint(app.state.posts, app.state.capacity);
  if (!move) {
    screens.toast('Ходов не осталось — попробуй «Заново»');
    return;
  }
  app.hand = null;
  app.hint = move;
  app.hintUntil = app.time + HINT_SHOW_MS;
  app.hintsUsed += 1;
  updateHud();
}

async function requestExtraPost() {
  if (app.busy || app.extraPostUsed) return;
  if (!(await earnReward())) return;
  app.state.posts = app.state.posts.map((post) => post.slice());
  app.state.posts.push([]);
  app.extraPostUsed = true;
  app.hand = null;
  clearHistory(app.history);
  rebuildLayout();
  updateHud();
}

async function earnReward() {
  sfx.setMuted(true);
  const rewarded = await platform.showRewarded();
  sfx.setMuted(app.settings.muted);
  if (!rewarded) screens.toast('Награда не получена');
  return rewarded;
}

// --- сохранение -----------------------------------------------------------

function persist() {
  platform.save({
    level: app.progress.level,
    citySchemaVersion: CITY_SCHEMA_VERSION,
    city: app.city.buildings,
    muted: app.settings.muted,
    vibro: app.settings.vibro
  });
}

async function restore() {
  const data = await platform.load();
  if (!data) return;
  app.progress.level = Math.max(1, Number(data.level) || 1);
  app.settings.muted = Boolean(data.muted);
  app.settings.vibro = data.vibro !== false;
  if (Array.isArray(data.city)) {
    // Сохранение старой версии не читаем по частям: город собирается
    // заново по актуальным правилам из числа собранных столбиков.
    if (data.citySchemaVersion === CITY_SCHEMA_VERSION) {
      app.city.buildings = data.city.slice();
      syncCamera(app.city);
      app.city.dirty = true;
    } else {
      rebuildCity(app.city, countColumns(data.city));
    }
  }
  sfx.setMuted(app.settings.muted);
}

// --- цикл -----------------------------------------------------------------

function frame(now) {
  const dt = Math.min(MAX_DELTA, now - app.time || 0);
  app.time = now;
  if (!app.paused) {
    updateTweens(app.tweens, dt);
    updateFx(app.fx, dt);
    if (app.hand) {
      app.hand.bob = Math.sin((now / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE;
    }
    if (!app.busy && app.pending.length > 0) onTap(app.pending.shift());
    if (app.hint && now > app.hintUntil) app.hint = null;
    app.hintPulse = 0.5 + 0.5 * Math.sin((now / 700) * Math.PI * 2);
  }
  render();
  debug.update({
    time: now,
    dpr: app.dpr,
    layout: app.layout,
    level: app.level,
    par: app.state ? app.state.parMoves : 0,
    moves: app.state ? app.state.moves : 0
  });
  requestAnimationFrame(frame);
}

function render() {
  if (!app.layout) return;
  drawScene(ctx, {
    layout: app.layout,
    dpr: app.dpr,
    posts: app.state ? app.state.posts : [],
    city: app.city,
    cityAppear: app.cityAppear,
    hand: app.hand,
    flight: app.flight,
    hidden: app.hidden,
    landing: app.landing,
    wave: app.wave,
    shake: app.shake,
    hint: app.hint,
    hintPulse: app.hintPulse,
    fx: app.fx,
    fade: app.fade
  });
}

// --- ввод -----------------------------------------------------------------

// Только pointerdown: touchstart вместе с mousedown дают двойное срабатывание.
canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sfx.resumeAudio();
  if (!app.layout || app.screen !== 'game') return;
  const rect = canvas.getBoundingClientRect();
  const index = hitTest(app.layout, event.clientX - rect.left, event.clientY - rect.top);
  onTap(index);
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());

document.addEventListener('visibilitychange', () => {
  setPaused(document.hidden);
});

window.addEventListener('message', (event) => {
  if (event.data === 'game_api_pause') setPaused(true);
  if (event.data === 'game_api_resume') setPaused(false);
});

function setPaused(paused) {
  app.paused = paused;
  if (paused) sfx.suspendAudio();
  else sfx.resumeAudio();
}

// --- старт ----------------------------------------------------------------

async function boot() {
  screens.setProgress(0.1);
  resize();
  screens.setProgress(0.35);
  await platform.initPlatform();
  screens.setProgress(0.6);
  await restore();
  sfx.initAudio();
  screens.setProgress(0.85);
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      // Шрифты не критичны — играем системными.
    }
  }
  screens.setProgress(1);
  requestAnimationFrame(frame);
  // LoadingAPI.ready() — ровно один раз, после первого отрисованного кадра.
  requestAnimationFrame(() => {
    platform.ready();
    openMenu();
  });
}

boot();
