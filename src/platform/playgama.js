// Реализация фасада под Playgama Bridge v2. Все имена методов и значения
// состояний — из документации моста, не из головы:
// https://wiki.playgama.com/playgama/bridge-sdk/api
// Модули моста (platform, storage, advertisement) недоступны до
// bridge.initialize() — обращаться к ним раньше нельзя, SDK ругается в консоль.

const SAVE_KEY = 'save';
// Зеркало сейва: тот же ключ, что у заглушки и Яндекса, — иначе прогресс
// сессии, отработавшей без моста, потеряется при следующем заходе.
const LOCAL_KEY = 'cubesort.save';
// platform.id в окружении, которое мост не поддерживает: локальный запуск,
// GitHub Pages. Играем там как без SDK.
export const MOCK_PLATFORM = 'mock';

const INTERSTITIAL_CLOSED = 'closed';
const INTERSTITIAL_FAILED = 'failed';
const REWARDED_REWARDED = 'rewarded';
const REWARDED_CLOSED = 'closed';
const REWARDED_FAILED = 'failed';

export function createPlaygamaAdapter() {
  const bridge = window.bridge;
  let lang = '';
  let platformId = '';

  function events() {
    return (bridge && bridge.EVENT_NAME) || {};
  }

  function messages() {
    return (bridge && bridge.PLATFORM_MESSAGE) || {};
  }

  return {
    name: 'playgama',
    async init() {
      await bridge.initialize();
      platformId = bridge.platform.id || '';
      // Язык моста: площадка, а если она молчит — язык браузера. Пустую
      // строку отдаём как «неизвестно», чтобы решал i18n.
      lang = bridge.platform.language || '';
    },
    // Мост поднялся, но настоящей площадки за ним нет.
    isMock() {
      return platformId === MOCK_PLATFORM;
    },
    language() {
      return lang;
    },
    isAudioEnabled() {
      return bridge.platform.isAudioEnabled !== false;
    },
    // Площадка вправе потребовать тишины — например, когда игрок ушёл
    // на другую вкладку портала.
    onAudioStateChanged(listener) {
      bridge.platform.on(events().AUDIO_STATE_CHANGED, (enabled) => listener(enabled !== false));
    },
    // Пауза по требованию площадки: игрок открыл оверлей портала, свернул
    // вкладку, ответил на звонок.
    isPaused() {
      return bridge.platform.isPaused === true;
    },
    onPauseStateChanged(listener) {
      bridge.platform.on(events().PAUSE_STATE_CHANGED, (paused) => listener(paused === true));
    },
    ready() {
      bridge.platform.sendMessage(messages().GAME_READY);
    },
    gameplayStart(info) {
      bridge.platform.sendMessage(messages().LEVEL_STARTED, info);
    },
    gameplayStop(info) {
      bridge.platform.sendMessage(messages().LEVEL_PAUSED, info);
    },
    gameplayComplete(info) {
      bridge.platform.sendMessage(messages().LEVEL_COMPLETED, info);
    },
    showAd() {
      const ads = bridge.advertisement;
      if (!ads) return Promise.resolve(false);
      return new Promise((resolve) => {
        const name = events().INTERSTITIAL_STATE_CHANGED;
        const handler = (state) => {
          if (state !== INTERSTITIAL_CLOSED && state !== INTERSTITIAL_FAILED) return;
          ads.off(name, handler);
          resolve(state === INTERSTITIAL_CLOSED);
        };
        ads.on(name, handler);
        ads.showInterstitial();
      });
    },
    showRewarded() {
      const ads = bridge.advertisement;
      if (!ads) return Promise.resolve(false);
      return new Promise((resolve) => {
        const name = events().REWARDED_STATE_CHANGED;
        let rewarded = false;
        const handler = (state) => {
          // Награда только по 'rewarded': на 'closed' игрок получил бы её,
          // не досмотрев ролик.
          if (state === REWARDED_REWARDED) rewarded = true;
          if (state !== REWARDED_CLOSED && state !== REWARDED_FAILED) return;
          ads.off(name, handler);
          resolve(rewarded);
        };
        ads.on(name, handler);
        ads.showRewarded();
      });
    },
    // storage.set принимает два массива — ключи и значения.
    async save(data) {
      writeLocal(data);
      try {
        await bridge.storage.set([SAVE_KEY], [data]);
      } catch (error) {
        // Облако недоступно — прогресс остался в зеркале.
      }
    },
    // storage.get возвращает массив в порядке запрошенных ключей,
    // null за отсутствующий ключ.
    async load() {
      const cloud = await readCloud(bridge);
      const local = readLocal();
      if (!cloud) return local;
      if (!local) return cloud;
      // Сессия без моста писала только в зеркало. Если оно свежее облака,
      // поднимаем его вперёд — иначе прогресс той сессии откатится.
      return stampOf(local) > stampOf(cloud) ? local : cloud;
    }
  };
}

async function readCloud(bridge) {
  try {
    const data = await bridge.storage.get([SAVE_KEY]);
    return (Array.isArray(data) ? data[0] : data) || null;
  } catch (error) {
    return null;
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (error) {
    // Приватный режим режет localStorage — облако всё равно основное.
  }
}

// Сохранения до появления штампа считаем самыми старыми: при равенстве
// выигрывает облако.
function stampOf(data) {
  return data && typeof data.savedAt === 'number' ? data.savedAt : 0;
}
