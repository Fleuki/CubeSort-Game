// Точка входа: игровой цикл, ввод и склейка модулей.
// Тайминги — из раздела 6 дизайн-дока, менять только вместе с ним.

import { LEVELS_EASY } from '../levels/levels-easy.js';
import { LEVELS_NORMAL } from '../levels/levels-normal.js';
import { LEVELS_HARD } from '../levels/levels-hard.js';
import { createState } from './game/state.js';
import { MODE_IDS, DEFAULT_MODE, MEDAL_COLORS, modeConfig, levelSeed, medalFor } from './game/modes.js';
import { takeTopGroup, canMove, moveBlocker, applyMove, isSolved, isPostComplete } from './game/rules.js';
import { generateLevel } from './game/generator.js';
import { findHint, findOptimal } from './game/solver.js';
import { createHistory, pushHistory, popHistory, canUndo, clearHistory } from './game/history.js';
import { computeLayout, hitTest, slotPosition } from './render/layout.js';
import { drawScene } from './render/scene.js';
import { PALETTE } from './render/iso.js';
import { createCity, getCityCanvas, grantMonument, monumentRise, prepareReward, commitReward, flushRewards, resetCity, rewardPoint, snapshotCity, restoreCity, completedDistrict, lightingOrder, lightBuilding, cameraTarget, setCameraStage, loadCity, rebuildCity, CITY_SCHEMA_VERSION } from './render/city.js';
import { createTweenPool, addTween, updateTweens, clearTweens, EASING, setTimeScale } from './anim/tween.js';
import { createFx, updateFx, spawnSplinters, shakeCamera } from './anim/fx.js';
import * as sfx from './audio/sfx.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createDebug } from './ui/debug.js';
import * as platform from './platform/sdk.js';
import { t, initLanguage, getLanguage, onLanguageChange } from './i18n.js';

const LIFT_MS = 120;
const BOB_AMPLITUDE = 3;
const BOB_PERIOD = 1600;
const FLIGHT_BASE_MS = 180;
const FLIGHT_PER_CUBE_MS = 25;
const ARC_HEIGHT = 70;
const SQUASH_MS = 110;
const SQUASH_FROM = 0.88;
const DENY_MS = 220;
const DENY_CYCLES = 3;
const DENY_AMPLITUDE = 5;
// Отказ сначала показывает причину и только потом дрожит: вспышка
// на дрожащем столбике не читается.
const DENY_SHAKE_DELAY_MS = 60;
const DENY_COLOR_FLASH_MS = 140;
const DENY_SPACE_FLASH_MS = 200;
const TRANSITION_MS = 550;
const HINT_SHOW_MS = 3200;
const WINDOW_STEP_MS = 60;
const CAMERA_MS = 700;
// Кульминация уровня — сборка столбика. Вся последовательность задана
// здесь и нигде больше: волна, кольцо, крышка, щепки, тряска, полёт
// награды в город и её приземление.
const WAVE_STEP_MS = 55;
const WAVE_HOP_STEPS = 2;
const BURST_AT_MS = 180;
const BURST_MS = 260;
const CAP_AT_MS = 220;
const CAP_MS = 200;
const CAP_SQUASH_MS = 110;
const CAP_SQUASH_FROM = 0.86;
const SPARK_AT_MS = 240;
const SPARK_COUNT = 8;
const SPARK_LIFE_MS = 420;
const SHAKE_AT_MS = 240;
const REWARD_AT_MS = 300;
const REWARD_FLIGHT_MS = 520;
const REWARD_ARC = 0.4;
const REWARD_SPIN = (25 * Math.PI) / 180;
const REWARD_LAND_MS = 180;
const REWARD_SQUASH_FROM = 0.86;
const RIPPLE_MS = 320;
// Памятник за пройденный режим: выезд снизу, потом волна свечения.
const MONUMENT_RISE_MS = 500;
const MONUMENT_GLOW_MS = 700;
const WIN_DELAY_MS = 420;
const VIBRO_TAKE = 8;
const VIBRO_PLACE = 12;
const VIBRO_COMPLETE = 30;
const PENDING_LIMIT = 2;
const MAX_DELTA = 50;
const MAX_DPR = 2;
// Игра портретная. На широком экране сцена — центрированная вертикальная
// рамка шириной не больше PORTRAIT_RATIO от высоты; по бокам остаются поля,
// иначе изометрия города расползается по ширине.
const PORTRAIT_RATIO = 0.56;
const LOOSE_LEVEL_NODES = 25000;
const PAR_MAX_DEPTH = 20;
const INEXACT_PAR_FACTOR = 0.8;
// Уровни трёх режимов: каждый набор сгенерирован офлайн отдельно.
const LEVEL_SETS = { easy: LEVELS_EASY, normal: LEVELS_NORMAL, hard: LEVELS_HARD };
// Версия схемы сохранения: v3 — слоты без звёзд, медаль за режим.
const SAVE_VERSION = 3;
const SETTINGS_KEY = 'settings';
// Миниатюра города на карточке режима: город рисуется в свою зону
// вдвое крупнее карточки, а на карточку попадает её середина —
// так миниатюра не сплющена и не мыльная.
const THUMB_WIDTH = 600;
const THUMB_HEIGHT = 300;

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });

const app = {
  screen: 'loading',
  dpr: 1,
  stageW: 0,
  stageH: 0,
  layout: null,
  level: 1,
  state: null,
  history: createHistory(),
  mode: DEFAULT_MODE,
  // Города всех режимов живут рядом: миниатюры на экране выбора рисуются
  // из настоящих городов, а не из заглушек.
  cities: {},
  slots: {},
  city: createCity(),
  fx: createFx(),
  tweens: createTweenPool(),
  hand: null,
  flight: null,
  hidden: null,
  shake: null,
  deny: null,
  hint: null,
  // Празднование сборки столбика идёт параллельно ходам, поэтому
  // каждый эффект живёт в списке: их может быть несколько сразу.
  landings: [],
  waves: [],
  bursts: [],
  caps: [],
  rewards: [],
  drops: [],
  ripples: [],
  winning: false,
  pending: [],
  hintPulse: 0,
  hintUntil: 0,
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

// Пустой слот режима: уровень, звёзды по уровням, город, медаль.
function emptySlot() {
  return { level: 1, city: [], props: [], citySchemaVersion: CITY_SCHEMA_VERSION, medal: null, monument: null };
}

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
  play: (mode) => startGame(mode),
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
    applyMute();
    screens.showSettings(app.settings, app.screen === 'game');
  },
  toggleVibro: () => {
    app.settings.vibro = !app.settings.vibro;
    screens.showSettings(app.settings, app.screen === 'game');
  },
  // Сбрасывается только текущий режим — остальные не трогаем.
  resetProgress: () => {
    app.progress.level = 1;
    app.level = 1;
    app.slots[app.mode].medal = null;
    resetCity(app.city);
    persist();
    screens.hideSettings();
    openMenu();
  }
});

// Звук выключен, если так решил игрок или так требует площадка.
let platformAudio = true;
function applyMute() {
  sfx.setMuted(app.settings.muted || !platformAudio);
}

function vibrate(ms) {
  if (!app.settings.vibro || !navigator.vibrate) return;
  navigator.vibrate(ms);
}

const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');

// Единственное место, где язык встречается с DOM: атрибут lang, заголовок
// вкладки и все статические подписи из разметки.
function applyLanguage() {
  document.documentElement.lang = getLanguage();
  // Логотип на загрузке ждал именно этого момента.
  document.documentElement.classList.add('lang-ready');
  document.title = t('app.title');
  if (appTitle) appTitle.setAttribute('content', t('app.title'));
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });
}

// Смена языка на лету: статика из разметки, счётчик ходов и открытый экран.
// Сцену трогать не нужно — в канвасе текста нет.
onLanguageChange(() => {
  applyLanguage();
  hud.refreshLanguage();
  screens.refreshLanguage();
});

function resize() {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  // На широком экране сцена сжимается до портретной рамки и центрируется;
  // на телефоне stageW == ширине окна, рамки нет.
  const stageW = Math.min(winW, Math.round(winH * PORTRAIT_RATIO));
  const stageH = winH;
  const left = Math.round((winW - stageW) / 2);
  app.stageW = stageW;
  app.stageH = stageH;
  // Выше 2x бюджетные телефоны не тянут.
  app.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(stageW * app.dpr);
  canvas.height = Math.round(stageH * app.dpr);
  canvas.style.width = `${stageW}px`;
  canvas.style.height = `${stageH}px`;
  canvas.style.left = `${left}px`;
  // HUD выравнивается по рамке через CSS-переменные, а не по окну.
  const root = document.documentElement.style;
  root.setProperty('--stage-w', `${stageW}px`);
  root.setProperty('--stage-left', `${left}px`);
  rebuildLayout(stageW, stageH);
}

function rebuildLayout(width, height) {
  const postCount = app.state ? app.state.posts.length : 5;
  const capacity = app.state ? app.state.capacity : 4;
  app.layout = computeLayout(
    width || app.stageW || window.innerWidth,
    height || app.stageH || window.innerHeight,
    postCount,
    capacity
  );
  app.city.dirty = true;
}

// Уровни после 60-го считаются на лету — один раз при старте уровня,
// а не на каждый ход. par считается так же, как в офлайн-генераторе.
function levelData(id) {
  const list = LEVEL_SETS[app.mode];
  if (id <= list.length) return list[id - 1];
  const level = generateLevel(app.mode, id, levelSeed(app.mode, id));
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
  // Награда, не долетевшая до города, всё равно заработана; хвосты
  // анимаций прошлого уровня гасим, чтобы они не писали в новое состояние.
  flushRewards(app.city);
  clearTweens(app.tweens);
  app.level = id;
  app.state = createState(levelData(id));
  clearHistory(app.history);
  app.hand = null;
  app.flight = null;
  app.hidden = null;
  app.landing = null;
  app.shake = null;
  app.deny = null;
  app.hint = null;
  clearEffects();
  app.pending.length = 0;
  app.busy = false;
  app.winning = false;
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
  if (app.state) hud.setGoal(app.state.moves);
  hud.update({
    undoUsed: app.undoUsed,
    hintsUsed: app.hintsUsed,
    extraPostUsed: app.extraPostUsed,
    canUndo: canUndo(app.history)
  });
}

function startGame(mode) {
  const chosen = MODE_IDS.indexOf(mode) >= 0 ? mode : app.mode;
  app.mode = chosen;
  app.settings.mode = chosen;
  app.city = app.cities[chosen];
  app.progress.level = app.slots[chosen].level;
  hud.setLimits(modeConfig(chosen).free);
  app.screen = 'game';
  screens.hideAll();
  hud.show();
  startLevel(app.progress.level);
  persist();
}

// Экран выбора режима: на каждой карточке настоящий город этого режима.
function openMenu() {
  app.screen = 'menu';
  platform.gameplayStop();
  hud.hide();
  const states = {};
  const rect = { x: 0, y: 0, width: THUMB_WIDTH, height: THUMB_HEIGHT };
  MODE_IDS.forEach((mode) => {
    const slot = app.slots[mode];
    const city = app.cities[mode];
    states[mode] = {
      started: slot.level > 1 || city.buildings.length > 0,
      level: slot.level,
      medal: slot.medal,
      thumb: getCityCanvas(city, rect)
    };
  });
  screens.showMenu(states);
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
  // Собранный столбик закрыт крышкой: ни взять, ни положить, ни отказа.
  if (isPostComplete(app.state.posts[index], app.state.capacity)) return;
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

// Опускание группы обратно ввод не блокирует: пока она едет вниз,
// её можно перехватить и отправить на другой столбик.
function returnGroup() {
  const hand = app.hand;
  if (!hand || hand.returning) return;
  hand.returning = true;
  addTween(app.tweens, {
    duration: LIFT_MS,
    easing: EASING.easeOutQuad,
    onUpdate: (t) => {
      if (app.hand === hand) hand.lift = 1 - t;
    },
    onDone: () => {
      if (app.hand === hand) app.hand = null;
    }
  });
}

// Отказ объясняет причину без слов: несовпадение цвета — вспышка обводки
// у спорящих кубиков, нехватка места — вспышка свободных ромбов цели.
// Дрожь — тоже декорация: следующий тап она не съедает.
function denyMove(index) {
  const kind = moveBlocker(app.state.posts, app.hand.from, index, app.state.capacity);
  if (kind === 'space') sfx.playDenySpace();
  else sfx.playDeny();
  if (kind) {
    const deny = { index, kind, flash: 0 };
    app.deny = deny;
    addTween(app.tweens, {
      duration: kind === 'color' ? DENY_COLOR_FLASH_MS : DENY_SPACE_FLASH_MS,
      onUpdate: (t) => {
        // Вспышка вспыхивает и гаснет внутри своей длительности.
        deny.flash = Math.sin(t * Math.PI);
      },
      onDone: () => {
        if (app.deny === deny) app.deny = null;
      }
    });
  }
  // При prefers-reduced-motion остаётся только вспышка: она несёт смысл,
  // дрожь — нет.
  if (app.fx.reducedMotion) return;
  const shake = { index, offset: 0 };
  addTween(app.tweens, {
    delay: DENY_SHAKE_DELAY_MS,
    duration: DENY_MS,
    onStart: () => {
      app.shake = shake;
    },
    onUpdate: (t) => {
      const decay = 1 - t;
      shake.offset = Math.sin(t * Math.PI * 2 * DENY_CYCLES) * DENY_AMPLITUDE * decay;
    },
    onDone: () => {
      if (app.shake === shake) app.shake = null;
    }
  });
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
  // Перелёт кончился — ввод свободен. Всё, что дальше, декоративно.
  app.busy = false;

  const landing = { post: to, fromSlot: app.state.posts[to].length - count, squash: SQUASH_FROM };
  app.landings.push(landing);
  addTween(app.tweens, {
    duration: SQUASH_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      landing.squash = SQUASH_FROM + (1 - SQUASH_FROM) * t;
    },
    onDone: () => {
      drop(app.landings, landing);
    }
  });

  spawnSplinters(app.fx, end.x, end.y, PALETTE[color % PALETTE.length]);
  sfx.playPlace();
  vibrate(VIBRO_PLACE);
  updateHud();

  if (isPostComplete(app.state.posts[to], app.state.capacity)) {
    // Дом даётся за пройденный уровень: если этот столбик его закрывает,
    // в город летит дом, иначе — декорация.
    completePost(to, color, isSolved(app.state.posts, app.state.capacity));
    return;
  }
  checkWin();
}

// Эффекты снимаются из своих списков по ссылке: за время анимации
// список мог поменяться.
function drop(list, effect) {
  const at = list.indexOf(effect);
  if (at >= 0) list.splice(at, 1);
}

function clearEffects() {
  cancelRewards();
  app.landings.length = 0;
  app.waves.length = 0;
  app.bursts.length = 0;
  app.caps.length = 0;
  app.ripples.length = 0;
}

// Отмена хода и смена уровня снимают награды с полёта: то, что уже
// зачтено, коммитится отдельно, остальное не должно долететь.
function cancelRewards() {
  for (let i = 0; i < app.rewards.length; i += 1) app.rewards[i].cancelled = true;
  for (let i = 0; i < app.drops.length; i += 1) app.drops[i].cancelled = true;
  app.rewards.length = 0;
  app.drops.length = 0;
}

function completePost(index, color, solving) {
  const capacity = app.state.capacity;
  sfx.playComplete();
  vibrate(VIBRO_COMPLETE);

  // 0 мс — волна подпрыгивания снизу вверх.
  const wave = { post: index, t: 0 };
  app.waves.push(wave);
  addTween(app.tweens, {
    duration: WAVE_STEP_MS * (capacity + WAVE_HOP_STEPS),
    onUpdate: (t) => {
      wave.t = t * (capacity + WAVE_HOP_STEPS);
    },
    onDone: () => {
      drop(app.waves, wave);
    }
  });

  // +180 мс — вспышка-кольцо от основания стопки наружу.
  const burst = { post: index, t: 0 };
  addTween(app.tweens, {
    delay: BURST_AT_MS,
    duration: BURST_MS,
    onStart: () => {
      app.bursts.push(burst);
    },
    onUpdate: (t) => {
      burst.t = t;
    },
    onDone: () => {
      drop(app.bursts, burst);
    }
  });

  // +220 мс — крышка падает сверху и садится с отскоком.
  // Крышка занимает место сразу: до её падения у столбика не рисуется
  // ни выступ, ни она сама.
  const cap = { post: index, hidden: true, lift: 1, squash: 1 };
  app.caps.push(cap);
  addTween(app.tweens, {
    delay: CAP_AT_MS,
    duration: CAP_MS,
    easing: EASING.easeOutBack,
    onStart: () => {
      cap.hidden = false;
    },
    onUpdate: (t) => {
      cap.lift = 1 - t;
    },
    onDone: () => settleCap(cap)
  });

  // +240 мс — щепки и тряска камеры.
  addTween(app.tweens, {
    delay: SPARK_AT_MS,
    duration: SHAKE_AT_MS - SPARK_AT_MS + 1,
    onStart: () => {
      if (app.fx.reducedMotion) return;
      const top = slotPosition(app.layout, index, capacity - 1);
      spawnSplinters(app.fx, app.layout.posts[index].x, top.y, PALETTE[color % PALETTE.length], SPARK_COUNT, SPARK_LIFE_MS);
      shakeCamera(app.fx);
    }
  });

  // +300 мс — награда вылетает из стопки и летит в город.
  const pending = prepareReward(app.city, color, app.level, solving);
  if (!pending) return;
  const reward = { pending, post: index, flying: false, x: 0, y: 0, unit: 1, angle: 0 };
  addTween(app.tweens, {
    delay: REWARD_AT_MS,
    duration: REWARD_FLIGHT_MS,
    easing: EASING.easeInOutQuad,
    onStart: () => {
      app.rewards.push(reward);
      reward.flying = true;
    },
    onUpdate: (t) => flyReward(reward, capacity, t),
    onDone: () => {
      if (reward.cancelled) return;
      landReward(reward, !pending.prop);
    }
  });
}

// Координаты пересчитываются каждый кадр: и точка вылета на поле,
// и точка приземления в городе живут в разных системах, а масштаб
// города может измениться прямо во время полёта.
function flyReward(reward, capacity, t) {
  const layout = app.layout;
  const post = layout.posts[reward.post];
  if (!post) return;
  const from = slotPosition(layout, reward.post, capacity - 1);
  const to = rewardPoint(layout.city, app.city, reward.pending);
  const startUnit = layout.step * post.scale;
  const arc = Math.hypot(to.x - post.x, to.y - from.y) * REWARD_ARC;
  reward.x = post.x + (to.x - post.x) * t;
  // Парабола: дуга поднимается на 40% расстояния до города.
  reward.y = from.y + (to.y - from.y) * t - 4 * arc * t * (1 - t);
  reward.unit = startUnit + (to.unit - startUnit) * t;
  reward.angle = Math.sin(t * Math.PI) * REWARD_SPIN;
}

// Крышка села: щелчок и короткий squash. Дальше её рисует сцена
// по состоянию столбика.
function settleCap(cap) {
  sfx.playCap();
  cap.lift = 0;
  cap.squash = CAP_SQUASH_FROM;
  addTween(app.tweens, {
    duration: CAP_SQUASH_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      cap.squash = CAP_SQUASH_FROM + (1 - CAP_SQUASH_FROM) * t;
    },
    onDone: () => {
      drop(app.caps, cap);
    }
  });
}

// +820 мс — награда приземлилась: отскок, волна по площадке, и только
// после этого она попадает в макет.
function landReward(reward, house) {
  const pending = reward.pending;
  sfx.playLand();
  drop(app.rewards, reward);
  const target = rewardPoint(app.layout.city, app.city, pending);
  const ripple = { x: target.x, y: target.y, t: 0 };
  app.ripples.push(ripple);
  addTween(app.tweens, {
    duration: RIPPLE_MS,
    onUpdate: (t) => {
      ripple.t = t;
    },
    onDone: () => {
      drop(app.ripples, ripple);
    }
  });
  const landing = { pending, squash: REWARD_SQUASH_FROM };
  app.drops.push(landing);
  addTween(app.tweens, {
    duration: REWARD_LAND_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      landing.squash = REWARD_SQUASH_FROM + (1 - REWARD_SQUASH_FROM) * t;
    },
    onDone: () => {
      drop(app.drops, landing);
      if (landing.cancelled) return;
      commitReward(app.city, pending);
      persist();
      const district = house ? completedDistrict(app.city) : -1;
      if (district >= 0) {
        lightDistrict(district);
        return;
      }
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
      checkWin();
    }
  });
}

// Победа проверяется после каждого хода и после каждой прилетевшей
// награды, но сработать должна ровно один раз.
function checkWin() {
  if (app.winning || app.screen !== 'game' || !app.state) return;
  if (!isSolved(app.state.posts, app.state.capacity)) return;
  // Дом за пройденный уровень ещё летит — экран победы подождёт его.
  if (app.rewards.length > 0 || app.drops.length > 0) return;
  app.winning = true;
  platform.gameplayStop();
  sfx.playWin();
  app.progress.level = Math.max(app.progress.level, app.level + 1);
  const medal = medalFor(app.mode, app.progress.level);
  app.slots[app.mode].medal = medal;
  // Пройден весь режим — в центре площадки встаёт памятник.
  const raised = medal ? raiseMonument(medal) : false;
  persist();
  addTween(app.tweens, {
    duration: raised ? MONUMENT_RISE_MS + MONUMENT_GLOW_MS : WIN_DELAY_MS,
    onDone: () => {
      app.screen = 'win';
      hud.hide();
      screens.showWin({
        moves: app.state.moves,
        cityCount: app.city.buildings.length
      });
    }
  });
}

// Памятник выезжает снизу, следом по площадке идёт тёплая волна.
// Тряски камеры здесь нет: это спокойный финал, а не удар.
function raiseMonument(medal) {
  if (!grantMonument(app.city, medal, MEDAL_COLORS[medal])) return false;
  monumentRise(app.city, 0);
  addTween(app.tweens, {
    duration: MONUMENT_RISE_MS,
    easing: EASING.easeOutBack,
    onUpdate: (t) => {
      monumentRise(app.city, t);
    },
    onDone: () => {
      monumentRise(app.city, 1);
    }
  });
  const glow = { x: 0, y: 0, t: 0, warm: true };
  addTween(app.tweens, {
    delay: MONUMENT_RISE_MS,
    duration: MONUMENT_GLOW_MS,
    onStart: () => {
      app.ripples.push(glow);
    },
    onUpdate: (t) => {
      glow.t = t;
    },
    onDone: () => {
      drop(app.ripples, glow);
    }
  });
  return true;
}

async function nextLevel() {
  screens.hideAll();
  // Реклама только между уровнями и только когда ничего не анимируется.
  if (platform.canShowInterstitial(app.level)) {
    sfx.setMuted(true);
    await platform.showInterstitial(app.level);
    applyMute();
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
  if (app.undoUsed >= modeConfig(app.mode).free.undo && !(await earnReward())) return;
  const snapshot = popHistory(app.history);
  if (!snapshot) return;
  cancelRewards();
  app.state.posts = snapshot.posts;
  app.state.moves = snapshot.moves;
  restoreCity(app.city, snapshot.city);
  app.hand = null;
  app.capAnim = null;
  app.hidden = null;
  app.undoUsed += 1;
  sfx.playTake();
  updateHud();
  persist();
}

async function requestHint() {
  if (app.busy) return;
  // Ищем до оплаты: честный отказ не должен стоить игроку попытки или ролика.
  const move = findHint(app.state.posts, app.state.capacity);
  if (!move) {
    screens.toast(t('toast.hintStuck'));
    return;
  }
  if (app.hintsUsed >= modeConfig(app.mode).free.hint && !(await earnReward())) return;
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
  applyMute();
  if (!rewarded) screens.toast(t('toast.rewardFailed'));
  return rewarded;
}

// --- сохранение -----------------------------------------------------------

// Слот режима собирается из живого состояния, остальные слоты остаются
// как есть: переключение режима не должно задевать чужой прогресс.
function persist() {
  const slot = app.slots[app.mode];
  slot.level = app.progress.level;
  slot.citySchemaVersion = CITY_SCHEMA_VERSION;
  slot.city = app.city.buildings;
  slot.props = app.city.props;
  slot.monument = app.city.monument;
  const data = {};
  data[SETTINGS_KEY] = {
    version: SAVE_VERSION,
    muted: app.settings.muted,
    vibro: app.settings.vibro,
    mode: app.mode
  };
  MODE_IDS.forEach((mode) => {
    data[slotKey(mode)] = app.slots[mode];
  });
  platform.save(data);
}

function slotKey(mode) {
  return `save:v1:${mode}`;
}

// Сколько столбиков собрано за пройденные уровни: по одному на цвет.
function columnsFor(mode, levels) {
  const list = LEVEL_SETS[mode];
  let total = 0;
  for (let i = 0; i < levels; i += 1) {
    total += list[Math.min(i, list.length - 1)].colors;
  }
  return total;
}

async function restore() {
  const data = (await platform.load()) || {};
  const settings = data[SETTINGS_KEY];
  if (settings) {
    app.settings.muted = Boolean(settings.muted);
    app.settings.vibro = settings.vibro !== false;
    if (MODE_IDS.indexOf(settings.mode) >= 0) app.mode = settings.mode;
  } else if (data.level !== undefined) {
    // Сохранение до режимов: настройки общие, прогресс уходит в средний.
    app.settings.muted = Boolean(data.muted);
    app.settings.vibro = data.vibro !== false;
    app.mode = DEFAULT_MODE;
  }
  MODE_IDS.forEach((mode) => {
    app.slots[mode] = readSlot(data, mode);
  });
  MODE_IDS.forEach((mode) => {
    const slot = app.slots[mode];
    const city = createCity([], [], modeConfig(mode).material);
    if (slot.citySchemaVersion === CITY_SCHEMA_VERSION && Array.isArray(slot.city)) {
      loadCity(city, slot.city, Array.isArray(slot.props) ? slot.props : [], slot.monument);
    } else {
      // Город старой схемы пересобирается по актуальным правилам —
      // из числа пройденных уровней и собранных за них столбиков.
      const passed = Math.max(0, slot.level - 1);
      rebuildCity(city, passed, columnsFor(mode, passed));
    }
    // Режим уже пройден — памятник стоит с самого начала, без анимации.
    if (slot.medal && !city.monument) grantMonument(city, slot.medal, MEDAL_COLORS[slot.medal]);
    // Слот держит памятник вместе с городом: иначе он живёт только
    // в памяти и при следующей записи неактивного режима пропадёт.
    slot.monument = city.monument;
    app.cities[mode] = city;
  });
  app.city = app.cities[app.mode];
  app.progress.level = app.slots[app.mode].level;
  applyMute();
}

// Слот режима из сохранения. Прогресс до режимов переносится в средний:
// нынешняя кривая сложности ближе всего к нему.
function readSlot(data, mode) {
  const slot = emptySlot();
  const stored = data[slotKey(mode)];
  const legacy = !data[SETTINGS_KEY] && mode === DEFAULT_MODE && data.level !== undefined ? data : null;
  const source = stored || legacy;
  if (!source) return slot;
  slot.level = Math.max(1, Number(source.level) || 1);
  // Медаль пересчитывается по режиму: звёзд в схеме больше нет.
  slot.medal = medalFor(mode, slot.level);
  slot.citySchemaVersion = source.citySchemaVersion;
  slot.city = Array.isArray(source.city) ? source.city : [];
  slot.props = Array.isArray(source.props) ? source.props : [];
  slot.monument = source.monument || null;
  return slot;
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

// Признак «столбик собран» пересчитывается каждый кадр: массив один
// и тот же, в цикле отрисовки мусора не создаём.
const completed = [];

function updateCompleted() {
  const posts = app.state ? app.state.posts : [];
  completed.length = posts.length;
  for (let i = 0; i < posts.length; i += 1) {
    completed[i] = isPostComplete(posts[i], app.state.capacity);
  }
}

function render() {
  if (!app.layout) return;
  updateCompleted();
  drawScene(ctx, {
    layout: app.layout,
    dpr: app.dpr,
    posts: app.state ? app.state.posts : [],
    capacity: app.state ? app.state.capacity : 0,
    completed,
    caps: app.caps,
    bursts: app.bursts,
    rewards: app.rewards,
    ripples: app.ripples,
    drops: app.drops,
    city: app.city,
    hand: app.hand,
    flight: app.flight,
    hidden: app.hidden,
    landings: app.landings,
    waves: app.waves,
    shake: app.shake,
    deny: app.deny,
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
document.addEventListener('selectstart', (event) => event.preventDefault());
document.addEventListener('dragstart', (event) => event.preventDefault());

// Страховка от браузерной прокрутки поверх CSS-фиксации (§1.10.2):
// протяжка пальцем, колесо мыши и «скроллящие» клавиши не должны двигать
// страницу. Игра слушает только pointerdown, поэтому глушить их безопасно.
const SCROLL_KEYS = [' ', 'PageUp', 'PageDown', 'Home', 'End',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
window.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
window.addEventListener('keydown', (event) => {
  if (SCROLL_KEYS.includes(event.key)) event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  setPaused(document.hidden);
});
// Потеря фокуса окна тоже паузит звук и цикл (§1.3): вкладка может остаться
// видимой, но неактивной — visibilitychange тогда не срабатывает.
window.addEventListener('blur', () => setPaused(true));
window.addEventListener('focus', () => setPaused(false));

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
  platform.onAudioState((enabled) => {
    platformAudio = enabled;
    applyMute();
  });
  // Язык определяем до первого показа UI (§2.14): выбор игрока, затем язык
  // площадки, затем язык браузера.
  initLanguage(platform.language());
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
