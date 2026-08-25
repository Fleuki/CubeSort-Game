// Состояние уровня — чистые данные. Ни DOM, ни Canvas: модуль обязан
// запускаться в Node для прогонов генератора и солвера.

// Индекс в массиве столбика — снизу вверх.
export function createState(level) {
  return {
    id: level.id,
    capacity: level.capacity,
    colors: level.colors,
    parMoves: level.parMoves,
    posts: level.posts.map((post) => post.slice()),
    moves: 0
  };
}

export function cloneState(state) {
  return {
    id: state.id,
    capacity: state.capacity,
    colors: state.colors,
    parMoves: state.parMoves,
    posts: state.posts.map((post) => post.slice()),
    moves: state.moves
  };
}

// Решённое состояние: каждый цвет полностью занимает свой столбик,
// остальные столбики пустые. Отправная точка обратной генерации.
export function createSolvedPosts(colors, capacity, postCount) {
  const posts = [];
  for (let i = 0; i < postCount; i += 1) {
    posts.push(i < colors ? new Array(capacity).fill(i) : []);
  }
  return posts;
}

// Ключ для хеширования: столбики сортируются, чтобы перестановка
// одинаковых расстановок не считалась новым состоянием.
export function normalizeKey(posts) {
  const parts = new Array(posts.length);
  for (let i = 0; i < posts.length; i += 1) parts[i] = posts[i].join(',');
  parts.sort();
  return parts.join('|');
}
