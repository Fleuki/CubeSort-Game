// Заглушка для локальной разработки: сохранения в localStorage,
// реклама не показывается.

const KEY = 'cubesort.save';

export function createNoneAdapter() {
  return {
    name: 'none',
    async init() {},
    // Заглушка своего языка не имеет: пусть решает выбор игрока и браузер.
    language() {
      return '';
    },
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
    async showAd() {
      return false;
    },
    async showRewarded() {
      // Локально награда выдаётся сразу — иначе кнопки не проверить.
      return true;
    },
    async save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (error) {
        // Приватный режим Safari режет localStorage — прогресс не критичен.
      }
    },
    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    }
  };
}
