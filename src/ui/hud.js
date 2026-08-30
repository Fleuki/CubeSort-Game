// DOM-оверлей поверх канваса: счётчики и кнопки. Разметка лежит
// в index.html, здесь только связывание и обновление.

import { t } from '../i18n.js';

// Сколько бесплатных попыток в уровне — задаёт режим, здесь только
// значения по умолчанию до его выбора.
const DEFAULT_LIMITS = { undo: 3, hint: 2, post: 1 };

export function createHud(handlers) {
  const limits = { ...DEFAULT_LIMITS };
  // Последнее значение счётчика: при смене языка строку нужно собрать заново.
  let lastMoves = 0;
  const root = document.getElementById('hud');
  const levelNumber = document.getElementById('level-number');
  const levelGoal = document.getElementById('level-goal');
  const undoBadge = document.getElementById('undo-badge');
  const hintBadge = document.getElementById('hint-badge');
  const postBadge = document.getElementById('post-badge');
  const buttons = {
    undo: document.getElementById('btn-undo'),
    hint: document.getElementById('btn-hint'),
    post: document.getElementById('btn-post'),
    settings: document.getElementById('btn-settings'),
    menu: document.getElementById('btn-menu')
  };

  Object.keys(buttons).forEach((key) => {
    buttons[key].addEventListener('click', () => {
      if (handlers[key]) handlers[key]();
    });
  });

  return {
    // Лимиты приходят из режима: в лёгком их больше, в сложном меньше.
    setLimits(next) {
      limits.undo = next.undo;
      limits.hint = next.hint;
      limits.post = next.post;
    },
    show() {
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
    setLevel(level) {
      levelNumber.textContent = String(level);
    },
    // Счётчик ходов и ничего больше: порогов и оценок в игре нет.
    setGoal(moves) {
      lastMoves = moves;
      levelGoal.textContent = t('hud.moves', { n: moves });
    },
    refreshLanguage() {
      levelGoal.textContent = t('hud.moves', { n: lastMoves });
    },
    // Когда бесплатные попытки кончились — на бейдже значок рекламы.
    update(status) {
      setBadge(undoBadge, Math.max(0, limits.undo - status.undoUsed));
      // Серая кнопка с цифрой «3» противоречит сама себе: отменять нечего.
      undoBadge.classList.toggle('hidden', !status.canUndo);
      setBadge(hintBadge, Math.max(0, limits.hint - status.hintsUsed));
      postBadge.textContent = status.extraPostUsed ? '▶' : String(limits.post);
      postBadge.classList.toggle('reward', status.extraPostUsed);
      // Отменять нечего — кнопка выключена. А вот «дальше за рекламу» —
      // это рабочее состояние, и выключенной кнопка выглядеть не должна.
      buttons.undo.disabled = !status.canUndo;
      buttons.post.disabled = status.extraPostUsed;
    }
  };
}

function setBadge(node, left) {
  node.textContent = left > 0 ? String(left) : '▶';
  node.classList.toggle('reward', left === 0);
}

