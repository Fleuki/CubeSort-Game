// Экраны: загрузка, выбор режима, победа, настройки. Тоже чистый DOM.
// Миниатюры городов на карточках рисует город — здесь только вставка.

import { MODE_IDS, MODES, MEDAL_TITLES, LEVEL_COUNT, STARS_MAX } from '../game/modes.js';

const TOAST_MS = 1600;
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
      stars: document.getElementById(`mode-stars-${mode}`)
    };
    modeCards[mode].root.addEventListener('click', () => handlers.play(mode));
  });
  const winStars = document.getElementById('win-stars');
  const winStats = document.getElementById('win-stats');
  const winCity = document.getElementById('win-city');
  const soundState = document.getElementById('sound-state');
  const vibroState = document.getElementById('vibro-state');
  const toast = document.getElementById('toast');
  const restartButton = document.getElementById('btn-restart');
  let toastTimer = 0;

  document.getElementById('btn-next').addEventListener('click', handlers.next);
  document.getElementById('btn-menu-settings').addEventListener('click', handlers.openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', handlers.closeSettings);
  document.getElementById('btn-sound').addEventListener('click', handlers.toggleSound);
  document.getElementById('btn-vibro').addEventListener('click', handlers.toggleVibro);
  document.getElementById('btn-reset').addEventListener('click', handlers.resetProgress);
  document.getElementById('btn-restart').addEventListener('click', handlers.restart);

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
    // Каждая карточка показывает свой город, свой уровень и свои звёзды.
    showMenu(states) {
      hideAll();
      MODE_IDS.forEach((mode) => {
        const card = modeCards[mode];
        const state = states[mode];
        card.root.querySelector('.mode-title').textContent = MODES[mode].title;
        if (state.started) {
          card.progress.textContent = `Уровень ${Math.min(state.level, LEVEL_COUNT)} / ${LEVEL_COUNT}`;
          const medal = state.medal ? ` · ${MEDAL_TITLES[state.medal]}` : '';
          card.stars.textContent = `Звёзд ${state.stars} / ${STARS_MAX}${medal}`;
        } else {
          card.progress.textContent = MODES[mode].note;
          card.stars.textContent = 'Не начат';
        }
        paintThumb(card.city, state.thumb);
      });
      nodes.menu.classList.remove('hidden');
    },
    showWin({ stars, moves, cityCount }) {
      hideAll();
      const items = winStars.children;
      for (let i = 0; i < items.length; i += 1) {
        items[i].classList.toggle('off', i >= stars);
      }
      winStats.textContent = `Ходов: ${moves}`;
      winCity.textContent = `Домов в городе: ${cityCount}`;
      nodes.win.classList.remove('hidden');
    },
    showSettings(settings, inGame) {
      soundState.textContent = settings.muted ? 'выкл' : 'вкл';
      vibroState.textContent = settings.vibro ? 'вкл' : 'выкл';
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
    toast(message) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add('hidden'), TOAST_MS);
    }
  };
}
