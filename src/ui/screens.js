// Экраны: загрузка, главный, победа, настройки. Тоже чистый DOM.

const TOAST_MS = 1600;

export function createScreens(handlers) {
  const nodes = {
    loading: document.getElementById('screen-loading'),
    menu: document.getElementById('screen-menu'),
    win: document.getElementById('screen-win'),
    settings: document.getElementById('screen-settings')
  };
  const progressBar = document.getElementById('progress-bar');
  const menuLevel = document.getElementById('menu-level');
  const winStars = document.getElementById('win-stars');
  const winStats = document.getElementById('win-stats');
  const winCity = document.getElementById('win-city');
  const soundState = document.getElementById('sound-state');
  const vibroState = document.getElementById('vibro-state');
  const toast = document.getElementById('toast');
  let toastTimer = 0;

  document.getElementById('btn-play').addEventListener('click', handlers.play);
  document.getElementById('btn-next').addEventListener('click', handlers.next);
  document.getElementById('btn-menu-settings').addEventListener('click', handlers.openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', handlers.closeSettings);
  document.getElementById('btn-sound').addEventListener('click', handlers.toggleSound);
  document.getElementById('btn-vibro').addEventListener('click', handlers.toggleVibro);
  document.getElementById('btn-reset').addEventListener('click', handlers.resetProgress);

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
    showMenu(level) {
      hideAll();
      menuLevel.textContent = `Уровень ${level}`;
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
    showSettings(settings) {
      soundState.textContent = settings.muted ? 'выкл' : 'вкл';
      vibroState.textContent = settings.vibro ? 'вкл' : 'выкл';
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
