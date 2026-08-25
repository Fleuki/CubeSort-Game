// DOM-оверлей поверх канваса: счётчики и кнопки. Разметка лежит
// в index.html, здесь только связывание и обновление.

const FREE_UNDO = 3;
const FREE_HINTS = 2;

export function createHud(handlers) {
  const root = document.getElementById('hud');
  const levelNumber = document.getElementById('level-number');
  const undoBadge = document.getElementById('undo-badge');
  const hintBadge = document.getElementById('hint-badge');
  const postBadge = document.getElementById('post-badge');
  const buttons = {
    undo: document.getElementById('btn-undo'),
    hint: document.getElementById('btn-hint'),
    post: document.getElementById('btn-post'),
    restart: document.getElementById('btn-restart'),
    settings: document.getElementById('btn-settings'),
    menu: document.getElementById('btn-menu')
  };

  Object.keys(buttons).forEach((key) => {
    buttons[key].addEventListener('click', () => {
      if (handlers[key]) handlers[key]();
    });
  });

  return {
    show() {
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
    setLevel(level) {
      levelNumber.textContent = String(level);
    },
    // Когда бесплатные попытки кончились — на бейдже значок рекламы.
    update(status) {
      setBadge(undoBadge, Math.max(0, FREE_UNDO - status.undoUsed));
      setBadge(hintBadge, Math.max(0, FREE_HINTS - status.hintsUsed));
      postBadge.textContent = status.extraPostUsed ? '▶' : '1';
      postBadge.classList.toggle('reward', status.extraPostUsed);
      buttons.undo.disabled = !status.canUndo;
      buttons.post.disabled = status.extraPostUsed;
    }
  };
}

function setBadge(node, left) {
  node.textContent = left > 0 ? String(left) : '▶';
  node.classList.toggle('reward', left === 0);
}

export { FREE_UNDO, FREE_HINTS };
