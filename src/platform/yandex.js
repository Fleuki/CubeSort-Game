// Реализация фасада под Яндекс SDK. Скрипт SDK подключается площадкой
// или подгружается здесь — только на домене Яндекса.

const SDK_URL = 'https://yandex.ru/games/sdk/v2';
const LOCAL_KEY = 'cubesort.save';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function createYandexAdapter() {
  let ysdk = null;
  let player = null;
  let readyCalled = false;

  return {
    name: 'yandex',
    async init() {
      if (!window.YaGames) await loadScript(SDK_URL);
      ysdk = await window.YaGames.init();
      window.ysdk = ysdk;
      try {
        player = await ysdk.getPlayer({ scopes: false });
      } catch (error) {
        // Игра обязана работать без авторизации — падаем на localStorage.
        player = null;
      }
    },
    ready() {
      // LoadingAPI.ready() вызывается ровно один раз.
      if (readyCalled || !ysdk) return;
      readyCalled = true;
      if (ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready();
    },
    gameplayStart() {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.start();
    },
    gameplayStop() {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.stop();
    },
    showAd() {
      if (!ysdk) return Promise.resolve(false);
      return new Promise((resolve) => {
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => resolve(Boolean(wasShown)),
            onError: () => resolve(false)
          }
        });
      });
    },
    showRewarded() {
      if (!ysdk) return Promise.resolve(false);
      return new Promise((resolve) => {
        let rewarded = false;
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => resolve(rewarded),
            onError: () => resolve(false)
          }
        });
      });
    },
    async save(data) {
      if (player && player.setData) {
        try {
          await player.setData({ save: data }, true);
          return;
        } catch (error) {
          // Облако недоступно — пишем локально.
        }
      }
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      } catch (error) {
        // Ничего не поделать.
      }
    },
    async load() {
      if (player && player.getData) {
        try {
          const data = await player.getData(['save']);
          if (data && data.save) return data.save;
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
