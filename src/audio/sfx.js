// Синтез звука через WebAudio: файлов нет, внешних запросов нет.
// Деревянный щелчок — короткий шумовой всплеск плюс тон.

const TAKE_FREQ = 440;
const TAKE_MS = 40;
const DENY_FREQ = 140;
const DENY_MS = 90;
const CHORD_MS = 400;
const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
const COMBO_RESET_MS = 2000;
const DEFAULT_VOLUME = 0.5;

let context = null;
let master = null;
let enabled = true;
let comboIndex = 0;
let comboAt = 0;
let noiseBuffer = null;

export function initAudio() {
  if (context) return context;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = DEFAULT_VOLUME;
  master.connect(context.destination);
  noiseBuffer = createNoiseBuffer(context);
  return context;
}

export function resumeAudio() {
  if (context && context.state === 'suspended') context.resume();
}

export function suspendAudio() {
  if (context && context.state === 'running') context.suspend();
}

export function setMuted(muted) {
  enabled = !muted;
  if (master) master.gain.value = muted ? 0 : DEFAULT_VOLUME;
}

function createNoiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  return buffer;
}

function tone(freq, ms, type = 'triangle', gain = 0.28, delay = 0) {
  if (!context || !enabled) return;
  const now = context.currentTime + delay;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
  osc.connect(env);
  env.connect(master);
  osc.start(now);
  osc.stop(now + ms / 1000 + 0.02);
}

function click(gain = 0.35) {
  if (!context || !enabled || !noiseBuffer) return;
  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const env = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 1.2;
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  source.connect(filter);
  filter.connect(env);
  env.connect(master);
  source.start(now);
}

export function playTake() {
  tone(TAKE_FREQ, TAKE_MS, 'triangle', 0.22);
  click(0.18);
}

// Ноты идут вверх по пентатонике при укладке подряд — главный источник
// «приятности». Сбрасываются через 2 секунды бездействия.
export function playPlace() {
  const now = Date.now();
  if (now - comboAt > COMBO_RESET_MS) comboIndex = 0;
  comboAt = now;
  click(0.32);
  tone(PENTATONIC[Math.min(comboIndex, PENTATONIC.length - 1)], 180, 'triangle', 0.26);
  comboIndex = Math.min(comboIndex + 1, PENTATONIC.length - 1);
}

export function playComplete() {
  click(0.4);
  tone(PENTATONIC[0] * 2, CHORD_MS, 'triangle', 0.22);
  tone(PENTATONIC[2] * 2, CHORD_MS, 'triangle', 0.18, 0.03);
  tone(PENTATONIC[4] * 2, CHORD_MS, 'triangle', 0.16, 0.06);
}

// Крышка встала на место: короткий деревянный щелчок и низкий тон.
export function playCap() {
  click(0.34);
  tone(196, 90, 'triangle', 0.2);
}

// Награда приземлилась в городе: мягкий низкий удар.
export function playLand() {
  tone(98, 260, 'sine', 0.3);
  tone(147, 160, 'triangle', 0.12, 0.02);
}

export function playDeny() {
  tone(DENY_FREQ, DENY_MS, 'sine', 0.3);
}

export function playWin() {
  for (let i = 0; i < PENTATONIC.length; i += 1) {
    tone(PENTATONIC[i] * 2, 260, 'triangle', 0.2, i * 0.07);
  }
}

export function resetCombo() {
  comboIndex = 0;
}
