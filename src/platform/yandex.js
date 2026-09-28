// Реализация фасада под Яндекс SDK. Скрипт /sdk.js подключён тегом
// в index.html; догружать его отсюда нельзя — модерация (п. 1.19.1)
// принимает только способ из документации.

const LOCAL_KEY = 'cubesort.save';

export function createYandexAdapter() {
  let ysdk = null;
  let player = null;
  let readyCalled = false;
  let lang = 'ru';

  return {
    name: 'yandex',
    async init() {
      ysdk = await window.YaGames.init();
      window.ysdk = ysdk;
      // Язык площадки читаем через SDK сразу после init, до любого UI (§2.14).
      // Это требование модерации даже для одноязычной игры: важен сам факт
      // чтения i18n.lang до интерактивности, а не наличие переводов.
      try {
        lang = ysdk.environment.i18n.lang || 'ru';
      } catch (error) {
        lang = 'ru';
      }
      try {
        player = await ysdk.getPlayer({ scopes: false });
      } catch (error) {
        // Игра обязана работать без авторизации — падаем на localStorage.
        player = null;
      }
    },
    language() {
      return lang;
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
