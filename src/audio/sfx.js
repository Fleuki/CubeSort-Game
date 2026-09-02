// Звук: CC0-семплы через Web Audio API плюс небольшой процедурный синтез.
// Элементов <audio> нет и быть не должно — площадки за системный плеер
// в шторке уведомлений заворачивают.
//
// Три шины громкости, и это не блажь:
//   sfxGain   — переключатель «Звук» у игрока,
//   musicGain — переключатель «Музыка»,
//   master    — глушилка для рекламы и паузы площадки, поверх настроек.
// Реклама обязана глушить всё, а настройки игрока при этом не теряются.

const SFX_PATH = 'assets/audio/sfx/';
const MUSIC_PATH = 'assets/audio/music/';
// Имя файла трека. Пусто — музыки в сборке нет: запрос не уходит, в консоли
// не появляется 404, а переключатель «Музыка» прячется сам.
const MUSIC_FILE = 'theme.mp3';

// Имя события → файл. Событие без файла звучать не будет, но и не сломает
// ничего: игра просто промолчит в этом месте.
const SFX_FILES = {
  take: 'take.wav',
  undo: 'undo.wav',
  complete: 'complete.wav',
  cap: 'cap.wav',
  land: 'land.wav',
  denyColor: 'deny-color.wav',
  denySpace: 'deny-space.wav',
  win: 'win.wav',
  uiTap: 'ui-tap.wav',
  hint: 'hint.wav',
  postAdded: 'post-added.wav'
};

// Все файлы нормализованы по пику одинаково, поэтому баланс между
// событиями задаётся здесь: в файлах его править нельзя — потеряется
// при следующей пересборке пака.
// Победа громче всех, щелчок интерфейса тише всех (он звучит чаще
// остальных вместе взятых), отказы приглушены, чтобы не быть резкими.
const SFX_GAINS = {
  take: 0.55,
  undo: 0.55,
  complete: 0.8,
  cap: 0.6,
  land: 0.7,
  denyColor: 0.4,
  denySpace: 0.45,
  win: 1,
  uiTap: 0.25,
  hint: 0.6,
  postAdded: 0.55
};

const MASTER_VOLUME = 0.5;
const SFX_VOLUME = 1;
// Трек приходит тихим (пик -9.5 dBFS, RMS -24 dBFS), поэтому шина музыки
// заметно громче шины эффектов. Балансируем в коде, файл не трогаем —
// то же правило, что и для SFX_GAINS.
const MUSIC_VOLUME = 0.65;
// Музыка не обрывается на паузе, а уходит и возвращается плавно.
const MUSIC_FADE_S = 0.6;
const GAIN_FADE_S = 0.05;
// Ниже нуля gain не опускаем: exponentialRamp к нулю запрещён.
const SILENT = 0.0001;

// Укладка кубиков остаётся на синтезе: ноты идут вверх по пентатонике,
// и семплами эту связку не собрать без шести отдельных файлов.
const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
const COMBO_RESET_MS = 2000;

let context = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let noiseBuffer = null;

// Настройки игрока и глушилка площадки разведены: одно не должно
// затирать другое.
let soundMuted = false;
let musicMuted = false;
let silenced = false;

let comboIndex = 0;
let comboAt = 0;

const buffers = new Map();
let samplesRequested = false;
let musicBuffer = null;
let musicRequested = false;
let musicSource = null;
let unlocked = false;

const DEV = isDev();

function isDev() {
  try {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  } catch (error) {
    return false;
  }
}

export function initAudio() {
  if (context) return context;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  sfxGain = context.createGain();
  musicGain = context.createGain();
  master.gain.value = MASTER_VOLUME;
  sfxGain.gain.value = SFX_VOLUME;
  musicGain.gain.value = SILENT;
  sfxGain.connect(master);
  musicGain.connect(master);
  master.connect(context.destination);
  noiseBuffer = createNoiseBuffer(context);
  applyGains(0);
  loadSamples();
  return context;
}

// --- загрузка ------------------------------------------------------------

// Отсутствующий файл — не ошибка: кладём в кеш null и молчим на этом
// событии. Так игру можно запускать и собирать до того, как приедут семплы.
async function loadSample(name, file, path) {
  if (!context) return null;
  try {
    const response = await fetch(path + file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    return await context.decodeAudioData(bytes);
  } catch (error) {
    if (DEV) console.warn(`[sfx] нет семпла ${file}: ${error.message}`);
    return null;
  }
}

function loadSamples() {
  if (samplesRequested || !context) return;
  samplesRequested = true;
  Object.keys(SFX_FILES).forEach((name) => {
    buffers.set(name, null);
    loadSample(name, SFX_FILES[name], SFX_PATH).then((buffer) => {
      buffers.set(name, buffer);
    });
  });
}

// Загрузка трека и его запуск — разные вещи. Политика автоплея запрещает
// играть до жеста, но не запрещает скачивать: грузим заранее, чтобы к моменту,
// когда игрок откроет настройки, было известно, есть трек или нет.
// Вызывается после первого кадра, чтобы не тормозить экран загрузки.
export function loadMusic() {
  if (musicRequested || !context || !MUSIC_FILE) return Promise.resolve(null);
  musicRequested = true;
  return loadSample('music', MUSIC_FILE, MUSIC_PATH).then((buffer) => {
    musicBuffer = buffer;
    // Трек мог приехать уже после первого жеста — тогда запускаем сразу.
    if (buffer && unlocked && !musicMuted) startMusic();
    return buffer;
  });
}

// Есть ли вообще что играть: по этому признаку интерфейс прячет
// переключатель музыки, чтобы не показывать заведомо мёртвую кнопку.
export function hasMusic() {
  return Boolean(musicBuffer);
}

// --- громкость -----------------------------------------------------------

function rampTo(node, value, seconds) {
  if (!node || !context) return;
  const now = context.currentTime;
  const target = Math.max(SILENT, value);
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(Math.max(SILENT, node.gain.value), now);
  if (seconds > 0) node.gain.linearRampToValueAtTime(target, now + seconds);
  else node.gain.setValueAtTime(target, now);
}

function applyGains(fade = GAIN_FADE_S) {
  if (!context) return;
  rampTo(master, silenced ? SILENT : MASTER_VOLUME, fade);
  rampTo(sfxGain, soundMuted ? SILENT : SFX_VOLUME, fade);
  rampTo(musicGain, musicMuted || !musicSource ? SILENT : MUSIC_VOLUME, musicSource ? MUSIC_FADE_S : fade);
}

// Переключатель «Звук» у игрока.
export function setSoundMuted(muted) {
  soundMuted = Boolean(muted);
  applyGains();
}

// Переключатель «Музыка» у игрока. Выключенная музыка не просто затихает,
// а останавливается: держать буфер в проигрывании ради тишины незачем.
export function setMusicMuted(muted) {
  musicMuted = Boolean(muted);
  if (musicMuted) stopMusic();
  else if (unlocked) startMusic();
  applyGains();
}

// Глушилка поверх настроек: реклама и пауза площадки.
export function setSilenced(value) {
  silenced = Boolean(value);
  applyGains();
}

export function resumeAudio() {
  if (context && context.state === 'suspended') context.resume();
}

export function suspendAudio() {
  if (context && context.state === 'running') context.suspend();
}

// Первый жест игрока: только теперь браузер разрешает звук, и только
// теперь имеет смысл тянуть музыку.
export function unlockAudio() {
  resumeAudio();
  if (unlocked) return;
  unlocked = true;
  loadMusic().then(() => {
    if (!musicMuted) startMusic();
  });
}

// --- музыка --------------------------------------------------------------

function startMusic() {
  if (!context || !musicBuffer || musicSource || musicMuted) return;
  musicSource = context.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.loop = true;
  musicSource.connect(musicGain);
  musicSource.start(0);
  applyGains();
}

function stopMusic() {
  if (!musicSource) return;
  const source = musicSource;
  musicSource = null;
  rampTo(musicGain, SILENT, MUSIC_FADE_S);
  // Останавливаем после затухания, иначе трек обрывается щелчком.
  setTimeout(() => {
    try {
      source.stop();
    } catch (error) {
      // Источник мог остановиться сам — это не повод падать.
    }
  }, MUSIC_FADE_S * 1000);
}

// --- воспроизведение -----------------------------------------------------

function play(name) {
  if (!context || soundMuted || silenced) return;
  const buffer = buffers.get(name);
  if (!buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = SFX_GAINS[name];
  if (gain === undefined || gain === 1) {
    source.connect(sfxGain);
  } else {
    const env = context.createGain();
    env.gain.value = gain;
    source.connect(env);
    env.connect(sfxGain);
  }
  source.start(0);
}

function createNoiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  return buffer;
}

function tone(freq, ms, type = 'triangle', gain = 0.28, delay = 0) {
  if (!context || soundMuted || silenced) return;
  const now = context.currentTime + delay;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  env.gain.setValueAtTime(SILENT, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(SILENT, now + ms / 1000);
  osc.connect(env);
  env.connect(sfxGain);
  osc.start(now);
  osc.stop(now + ms / 1000 + 0.02);
}

function click(gain = 0.35, delay = 0) {
  if (!context || soundMuted || silenced || !noiseBuffer) return;
  const now = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const env = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 1.2;
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(SILENT, now + 0.07);
  source.connect(filter);
  filter.connect(env);
  env.connect(sfxGain);
  source.start(now);
}

export function playTake() {
  play('take');
}

export function playUndo() {
  play('undo');
}

// Единственный процедурный звук: ноты идут вверх по пентатонике при
// укладке подряд — это главный источник «приятности» механики.
// Сбрасываются через две секунды бездействия.
export function playPlace() {
  const now = Date.now();
  if (now - comboAt > COMBO_RESET_MS) comboIndex = 0;
  comboAt = now;
  click(0.32);
  tone(PENTATONIC[Math.min(comboIndex, PENTATONIC.length - 1)], 180, 'triangle', 0.26);
  comboIndex = Math.min(comboIndex + 1, PENTATONIC.length - 1);
}

export function playComplete() {
  play('complete');
}

export function playCap() {
  play('cap');
}

export function playLand() {
  play('land');
}

export function playDeny() {
  play('denyColor');
}

export function playDenySpace() {
  play('denySpace');
}

export function playWin() {
  play('win');
}

export function playUiTap() {
  play('uiTap');
}

export function playHint() {
  play('hint');
}

export function playPostAdded() {
  play('postAdded');
}

export function resetCombo() {
  comboIndex = 0;
}
