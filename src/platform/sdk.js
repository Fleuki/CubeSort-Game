// Единый фасад площадок. Игра знает только про эти методы,
// про конкретный SDK не знает никто, кроме реализаций.

import { createNoneAdapter } from './none.js';
import { createYandexAdapter } from './yandex.js';

const INTERSTITIAL_COOLDOWN_MS = 180000;
const FIRST_AD_LEVEL = 3;
// Дольше игрок ждать не должен: если SDK не поднялся за это время,
// уходим на заглушку и играем без площадки.
const INIT_TIMEOUT_MS = 5000;

let adapter = createNoneAdapter();
let lastInterstitial = 0;
let audioListener = null;
let pauseListener = null;

// YaGames появляется только если /sdk.js отдал сервер Яндекса.
// Локально скрипта нет — играем на заглушке.
function detectAdapter() {
  if (window.YaGames) return createYandexAdapter();
  return createNoneAdapter();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('platform init timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function initPlatform() {
  const candidate = detectAdapter();
  adapter = candidate;
  try {
    await withTimeout(Promise.resolve(candidate.init()), INIT_TIMEOUT_MS);
  } catch (error) {
    // Если SDK не поднялся, играем без него — это не повод падать.
    adapter = createNoneAdapter();
  }
  if (audioListener) bindAudio();
  if (pauseListener) bindPause();
  return adapter.name;
}

// Площадка может запретить звук — тогда игра молчит независимо от настройки
// игрока. Слушателя ставим один раз, до и после выбора адаптера.
function bindAudio() {
  if (adapter.onAudioStateChanged) adapter.onAudioStateChanged(audioListener);
  audioListener(adapter.isAudioEnabled ? adapter.isAudioEnabled() : true);
}

export function onAudioState(listener) {
  audioListener = listener;
  bindAudio();
}

// Площадка вправе поставить игру на паузу — например, когда игрок открыл
// её оверлей поверх канваса.
function bindPause() {
  if (adapter.onPauseStateChanged) adapter.onPauseStateChanged(pauseListener);
  pauseListener(adapter.isPaused ? adapter.isPaused() : false);
}

export function onPauseState(listener) {
  pauseListener = listener;
  bindPause();
}

export function platformName() {
  return adapter.name;
}

// Язык площадки, прочитанный из SDK во время init (§2.14). Пустая строка
// означает «площадка языка не назвала» — тогда решает i18n.
export function language() {
  return adapter.language ? adapter.language() : '';
}

export function ready() {
  adapter.ready();
}

export function gameplayStart(info) {
  adapter.gameplayStart(info);
}

export function gameplayStop(info) {
  adapter.gameplayStop(info);
}

// У Яндекса нет отдельного сообщения «уровень пройден» — закрываем геймплей.
export function gameplayComplete(info) {
  adapter.gameplayStop(info);
}

// Интерстишл не чаще раза в 3 минуты и не раньше третьего уровня.
export function canShowInterstitial(level) {
  if (level < FIRST_AD_LEVEL) return false;
  return Date.now() - lastInterstitial >= INTERSTITIAL_COOLDOWN_MS;
}

export async function showInterstitial(level) {
  if (!canShowInterstitial(level)) return false;
  lastInterstitial = Date.now();
  return adapter.showAd();
}

export async function showRewarded() {
  return adapter.showRewarded();
}

// Штамп времени ставит фасад, а не игра: по нему адаптер площадки решает,
// что свежее — облако или локальное зеркало.
export async function save(data) {
  return adapter.save({ ...data, savedAt: Date.now() });
}

export async function load() {
  return adapter.load();
}
