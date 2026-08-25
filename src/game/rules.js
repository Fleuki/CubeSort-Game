// Правила ходов. Функции принимают состояние и возвращают новое,
// исходные массивы не мутируются.

// Верхняя группа кубиков одного цвета. null — столбик пуст.
export function takeTopGroup(posts, index) {
  const post = posts[index];
  if (post.length === 0) return null;
  const color = post[post.length - 1];
  let count = 1;
  while (count < post.length && post[post.length - 1 - count] === color) count += 1;
  return { color, count };
}

export function freeSlots(posts, index, capacity) {
  return capacity - posts[index].length;
}

export function canMove(posts, from, to, capacity) {
  if (from === to) return false;
  const group = takeTopGroup(posts, from);
  if (!group) return false;
  const target = posts[to];
  if (target.length > 0 && target[target.length - 1] !== group.color) return false;
  if (freeSlots(posts, to, capacity) < group.count) return false;
  // Перекладывать целиком собранный столбик на пустой — ход без смысла,
  // он только раздувает перебор в солвере.
  if (target.length === 0 && group.count === posts[from].length) return false;
  return true;
}

export function applyMove(posts, from, to, capacity) {
  const group = takeTopGroup(posts, from);
  if (!group) return posts;
  const next = posts.map((post) => post.slice());
  for (let i = 0; i < group.count; i += 1) {
    next[from].pop();
    next[to].push(group.color);
  }
  return next;
}

export function listMoves(posts, capacity) {
  const moves = [];
  for (let from = 0; from < posts.length; from += 1) {
    if (posts[from].length === 0) continue;
    let emptySeen = false;
    for (let to = 0; to < posts.length; to += 1) {
      // Пустые столбики взаимозаменяемы — берём только первый.
      if (posts[to].length === 0) {
        if (emptySeen) continue;
        emptySeen = true;
      }
      if (canMove(posts, from, to, capacity)) moves.push({ from, to });
    }
  }
  return moves;
}

export function isPostComplete(post, capacity) {
  if (post.length !== capacity) return false;
  for (let i = 1; i < post.length; i += 1) {
    if (post[i] !== post[0]) return false;
  }
  return true;
}

// Победа: каждый непустой столбик заполнен до конца одним цветом.
export function isSolved(posts, capacity) {
  for (let i = 0; i < posts.length; i += 1) {
    if (posts[i].length === 0) continue;
    if (!isPostComplete(posts[i], capacity)) return false;
  }
  return true;
}

export function stars(moves, parMoves) {
  if (moves <= parMoves) return 3;
  if (moves <= Math.ceil(parMoves * 1.5)) return 2;
  return 1;
}
