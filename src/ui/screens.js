// Экраны: загрузка, выбор режима, победа, настройки. Тоже чистый DOM.
// Миниатюры городов на карточках рисует город — здесь только вставка.

import { MODE_IDS, MODES, MEDAL_COLORS, LEVEL_COUNT } from '../game/modes.js';
import { t, getLanguage, setLanguage, LANGS } from '../i18n.js';

const TOAST_MS = 1600;

// Настольные браузеры объявляют navigator.vibrate, но вызов молча игнорируют:
// одного наличия метода мало. Признак сенсорного ввода отсеивает их — на
// телефонах и планшетах maxTouchPoints всегда больше нуля.
function vibrationSupported() {
  return 'vibrate' in navigator && navigator.maxTouchPoints > 0;
}
// Откуда в городе начинается полоса миниатюры.
const THUMB_TOP = 0.24;

export function createScreens(handlers) {
  const nodes = {
    loading: document.getElementById('screen-loading'),
    menu: document.getElementById('screen-menu'),
    win: document.getElementById('screen-win'),
    settings: document.getElementById('screen-settings')
  };
  const progressBar = document.getElementById('progress-bar');
  const modeCards = {};
  MODE_IDS.forEach((mode) => {
    modeCards[mode] = {
      root: document.getElementById(`mode-${mode}`),
      city: document.getElementById(`mode-city-${mode}`),
      progress: document.getElementById(`mode-progress-${mode}`),
      medal: document.getElementById(`mode-medal-${mode}`)
    };
    modeCards[mode].root.addEventListener('click', () => handlers.play(mode));
  });
  const winStats = document.getElementById('win-stats');
  const winCity = document.getElementById('win-city');
  const soundState = document.getElementById('sound-state');
  const vibroState = document.getElementById('vibro-state');
  const toast = document.getElementById('toast');
  const restartButton = document.getElementById('btn-restart');
  const langButtons = {};
  let toastTimer = 0;
  // Последние показанные данные: смена языка перерисовывает экран из них,
  // не требуя от вызывающего кода повторять аргументы.
  let lastMenu = null;
  let lastWin = null;
  let lastSettings = null;

  document.getElementById('btn-next').addEventListener('click', handlers.next);
  document.getElementById('btn-menu-settings').addEventListener('click', handlers.openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', handlers.closeSettings);
  document.getElementById('btn-sound').addEventListener('click', handlers.toggleSound);
  // Строки для вибрации нет вовсе, если устройство её не умеет: выключенный
  // переключатель только сбивал бы с толку. Сохранённое значение при этом
  // не трогаем — на телефоне игрок найдёт настройку такой, как оставил.
  const vibroRow = document.getElementById('btn-vibro');
  const hasVibration = vibrationSupported();
  if (hasVibration) vibroRow.addEventListener('click', handlers.toggleVibro);
  else vibroRow.classList.add('hidden');
  document.getElementById('btn-reset').addEventListener('click', handlers.resetProgress);
  document.getElementById('btn-restart').addEventListener('click', handlers.restart);
  LANGS.forEach((lang) => {
    const node = document.getElementById(`btn-lang-${lang}`);
    if (!node) return;
    langButtons[lang] = node;
    node.addEventListener('click', () => setLanguage(lang));
  });

  function markLanguage() {
    const active = getLanguage();
    LANGS.forEach((lang) => {
      if (langButtons[lang]) langButtons[lang].classList.toggle('active', lang === active);
    });
  }

  // Миниатюра — вырезка из настоящего города режима: берём полосу
  // с площадкой и застройкой один в один, без растяжения.
  function paintThumb(canvas, source) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!source) return;
    const top = Math.max(0, Math.round(source.height * THUMB_TOP));
    ctx.drawImage(source, 0, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  }

  function hideAll() {
    Object.keys(nodes).forEach((key) => nodes[key].classList.add('hidden'));
  }

  return {
    setProgress(value) {
      progressBar.style.width = `${Math.round(value * 100)}%`;
    },
    showLoading() {
      hideAll();
      nodes.loading.classList.remove('hidden');
    },
    // Каждая карточка показывает свой город, свой уровень и медаль за режим.
    showMenu(states) {
      hideAll();
      lastMenu = states;
      MODE_IDS.forEach((mode) => {
        const card = modeCards[mode];
        const state = states[mode];
        card.progress.textContent = state.started
          ? t('menu.progress', { n: Math.min(state.level, LEVEL_COUNT), total: LEVEL_COUNT })
          : t('menu.notStarted', { note: t(MODES[mode].noteKey) });
        // Медаль — кружок в цвет металла, без подписи.
        card.medal.classList.toggle('hidden', !state.medal);
        if (state.medal) card.medal.style.background = MEDAL_COLORS[state.medal];
        paintThumb(card.city, state.thumb);
      });
      nodes.menu.classList.remove('hidden');
    },
    showWin({ moves, cityCount }) {
      hideAll();
      lastWin = { moves, cityCount };
      winStats.textContent = t('result.moves', { n: moves });
      winCity.textContent = t('result.city', { n: cityCount });
      nodes.win.classList.remove('hidden');
    },
    showSettings(settings, inGame) {
      lastSettings = { settings, inGame };
      soundState.textContent = t(settings.muted ? 'settings.off' : 'settings.on');
      if (hasVibration) vibroState.textContent = t(settings.vibro ? 'settings.on' : 'settings.off');
      markLanguage();
      // «Заново» нужен только внутри уровня.
      restartButton.classList.toggle('hidden', !inGame);
      nodes.settings.classList.remove('hidden');
    },
    hideSettings() {
      nodes.settings.classList.add('hidden');
    },
    isSettingsOpen() {
      return !nodes.settings.classList.contains('hidden');
    },
    hideAll,
    // Перерисовка после смены языка: молча обновляем то, что уже на экране.
    // Видимость считаем заранее — showMenu и showWin зовут hideAll и иначе
    // закрыли бы открытые поверх них настройки.
    refreshLanguage() {
      const openMenu = !nodes.menu.classList.contains('hidden');
      const openWin = !nodes.win.classList.contains('hidden');
      const openSettings = !nodes.settings.classList.contains('hidden');
      if (openMenu && lastMenu) this.showMenu(lastMenu);
      if (openWin && lastWin) this.showWin(lastWin);
      if (openSettings && lastSettings) {
        this.showSettings(lastSettings.settings, lastSettings.inGame);
      }
      markLanguage();
    },
    toast(message) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add('hidden'), TOAST_MS);
    }
  };
}
