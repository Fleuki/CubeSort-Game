// Единый фасад площадок. Игра знает только про эти методы,
// про конкретный SDK не знает никто, кроме реализаций.

import { createNoneAdapter } from './none.js';
import { createYandexAdapter } from './yandex.js';
import { createPlaygamaAdapter } from './playgama.js';

const INTERSTITIAL_COOLDOWN_MS = 180000;
const FIRST_AD_LEVEL = 3;
// Дольше игрок ждать не должен: если SDK не поднялся за это время,
// уходим на заглушку и играем без площадки.
const INIT_TIMEOUT_MS = 5000;

let adapter = createNoneAdapter();
let lastInterstitial = 0;
let audioListener = null;
let pauseListener = null;

// Яндекс проверяется первым: под него написан отдельный адаптер по
// требованиям гайда, и мост его подменять не должен.
function detectAdapter() {
  const host = window.location.hostname || '';
  if (window.YaGames || host.includes('yandex') || host.includes('games.s3')) return createYandexAdapter();
  // Признак моста — только метод initialize. Трогать bridge.platform до
  // инициализации нельзя: SDK возвращает undefined и пишет ошибку в консоль.
  if (window.bridge && typeof window.bridge.initialize === 'function') return createPlaygamaAdapter();
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
    // Мост поднялся, но площадки за ним нет (локальный запуск, GitHub Pages):
    // ведём себя ровно так, как будто SDK не подключали.
    if (candidate.isMock && candidate.isMock()) adapter = createNoneAdapter();
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

// Уровень пройден — это отдельное сообщение, а не «геймплей остановлен».
// Адаптеры без него (Яндекс, заглушка) просто закрывают геймплей.
export function gameplayComplete(info) {
  if (adapter.gameplayComplete) adapter.gameplayComplete(info);
  else adapter.gameplayStop(info);
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
