// DOM-оверлей поверх канваса: счётчики и кнопки. Разметка лежит
// в index.html, здесь только связывание и обновление.

const FREE_UNDO = 3;
const FREE_HINTS = 2;

export function createHud(handlers) {
  const root = document.getElementById('hud');
  const levelNumber = document.getElementById('level-number');
  const levelGoal = document.getElementById('level-goal');
  let goalTier = -1;
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
    show() {
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
    setLevel(level) {
      levelNumber.textContent = String(level);
      goalTier = -1;
    },
    // Порог показывается ближайший достижимый: перебрал par — строка
    // переезжает на две звезды, и число ходов один раз подсвечивается.
    setGoal(moves, par) {
      const twoStars = Math.ceil(par * 1.5);
      const tier = moves <= par ? 3 : (moves <= twoStars ? 2 : 1);
      let text = `Ходов ${moves}`;
      if (tier === 3) text += ` · на ★★★ — ${par}`;
      else if (tier === 2) text += ` · на ★★ — ${twoStars}`;
      else text += ' · ★';
      levelGoal.textContent = text;
      if (goalTier >= 0 && tier !== goalTier) {
        levelGoal.classList.remove('pulse');
        // Перезапуск анимации: без чтения offsetWidth класс вернётся
        // в том же кадре и ничего не проиграет.
        void levelGoal.offsetWidth;
        levelGoal.classList.add('pulse');
      }
      goalTier = tier;
    },
    // Когда бесплатные попытки кончились — на бейдже значок рекламы.
    update(status) {
      setBadge(undoBadge, Math.max(0, FREE_UNDO - status.undoUsed));
      // Серая кнопка с цифрой «3» противоречит сама себе: отменять нечего.
      undoBadge.classList.toggle('hidden', !status.canUndo);
      setBadge(hintBadge, Math.max(0, FREE_HINTS - status.hintsUsed));
      postBadge.textContent = status.extraPostUsed ? '▶' : '1';
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

export { FREE_UNDO, FREE_HINTS };
