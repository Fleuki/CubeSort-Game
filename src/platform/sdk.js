// Единый фасад площадок. Игра знает только про эти методы,
// про конкретный SDK не знает никто, кроме реализаций.

import { createNoneAdapter } from './none.js';
import { createYandexAdapter } from './yandex.js';
import { createPlaygamaAdapter } from './playgama.js';

const INTERSTITIAL_COOLDOWN_MS = 180000;
const FIRST_AD_LEVEL = 3;

let adapter = createNoneAdapter();
let lastInterstitial = 0;

function detectAdapter() {
  if (window.bridge && window.bridge.platform) return createPlaygamaAdapter();
  const host = window.location.hostname || '';
  if (window.YaGames || host.includes('yandex') || host.includes('games.s3')) return createYandexAdapter();
  return createNoneAdapter();
}

export async function initPlatform() {
  adapter = detectAdapter();
  try {
    await adapter.init();
  } catch (error) {
    // Если SDK не поднялся, играем без него — это не повод падать.
    adapter = createNoneAdapter();
  }
  return adapter.name;
}

export function platformName() {
  return adapter.name;
}

// Язык площадки, прочитанный из SDK во время init (§2.14).
export function language() {
  return adapter.language ? adapter.language() : 'ru';
}

export function ready() {
  adapter.ready();
}

export function gameplayStart() {
  adapter.gameplayStart();
}

export function gameplayStop() {
  adapter.gameplayStop();
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

export async function save(data) {
  return adapter.save(data);
}

export async function load() {
  return adapter.load();
}
