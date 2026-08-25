// Реализация фасада под Playgama Bridge. Подключается тем же способом,
// что и Яндекс: только когда мост реально присутствует на странице.

const LOCAL_KEY = 'cubesort.save';
const SAVE_KEY = 'save';

export function createPlaygamaAdapter() {
  const bridge = window.bridge;

  return {
    name: 'playgama',
    async init() {
      if (bridge && bridge.initialize) await bridge.initialize();
    },
    ready() {
      if (bridge && bridge.platform && bridge.platform.sendMessage) {
        bridge.platform.sendMessage('game_ready');
      }
    },
    gameplayStart() {
      if (bridge && bridge.platform && bridge.platform.sendMessage) {
        bridge.platform.sendMessage('gameplay_started');
      }
    },
    gameplayStop() {
      if (bridge && bridge.platform && bridge.platform.sendMessage) {
        bridge.platform.sendMessage('gameplay_stopped');
      }
    },
    showAd() {
      if (!bridge || !bridge.advertisement) return Promise.resolve(false);
      return new Promise((resolve) => {
        const handler = (state) => {
          if (state === 'closed' || state === 'failed') {
            bridge.advertisement.off('interstitial_state_changed', handler);
            resolve(state === 'closed');
          }
        };
        bridge.advertisement.on('interstitial_state_changed', handler);
        bridge.advertisement.showInterstitial();
      });
    },
    showRewarded() {
      if (!bridge || !bridge.advertisement) return Promise.resolve(false);
      return new Promise((resolve) => {
        let rewarded = false;
        const handler = (state) => {
          if (state === 'rewarded') rewarded = true;
          if (state === 'closed' || state === 'failed') {
            bridge.advertisement.off('rewarded_state_changed', handler);
            resolve(rewarded);
          }
        };
        bridge.advertisement.on('rewarded_state_changed', handler);
        bridge.advertisement.showRewarded();
      });
    },
    async save(data) {
      if (bridge && bridge.storage) {
        try {
          await bridge.storage.set(SAVE_KEY, data);
          return;
        } catch (error) {
          // Падаем на localStorage.
        }
      }
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      } catch (error) {
        // Ничего не поделать.
      }
    },
    async load() {
      if (bridge && bridge.storage) {
        try {
          const data = await bridge.storage.get(SAVE_KEY);
          if (data) return data;
        } catch (error) {
          // Падаем на localStorage.
        }
      }
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    }
  };
}
