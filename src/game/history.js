// Undo-стек: храним снимки столбиков до хода.

const MAX_DEPTH = 200;

export function createHistory() {
  return { stack: [] };
}

// Снимок хранится целиком: кроме столбиков в нём состояние города,
// иначе отмена хода оставит дом за несобранный столбик.
export function pushHistory(history, snapshot) {
  history.stack.push({
    posts: snapshot.posts.map((post) => post.slice()),
    city: snapshot.city,
    moves: snapshot.moves
  });
  if (history.stack.length > MAX_DEPTH) history.stack.shift();
}

export function popHistory(history) {
  return history.stack.pop() || null;
}

export function canUndo(history) {
  return history.stack.length > 0;
}

export function clearHistory(history) {
  history.stack.length = 0;
}
