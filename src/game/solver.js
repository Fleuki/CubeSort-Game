// Поиск решения. В рантайме вызывается ТОЛЬКО по кнопке подсказки:
// BFS с потолком по глубине. Полный поиск (solve) — для офлайн-проверки
// уровней в tools/gen-levels.js.

import { normalizeKey } from './state.js';
import { applyMove, listMoves, isSolved, takeTopGroup, freeSlots } from './rules.js';

const HINT_MAX_DEPTH = 12;
const HINT_MAX_NODES = 20000;
const SOLVE_MAX_NODES = 400000;
const SOLVE_MAX_DEPTH = 220;

// Подсказка: кратчайший путь до победы в пределах глубины.
// Если не нашли — любой ход, сливающий две группы одного цвета.
export function findHint(posts, capacity, maxDepth = HINT_MAX_DEPTH) {
  const start = normalizeKey(posts);
  const seen = new Set([start]);
  let frontier = [{ posts, first: null }];
  let nodes = 0;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next = [];
    for (let i = 0; i < frontier.length; i += 1) {
      const node = frontier[i];
      const moves = listMoves(node.posts, capacity);
      for (let m = 0; m < moves.length; m += 1) {
        const move = moves[m];
        const child = applyMove(node.posts, move.from, move.to, capacity);
        const first = node.first || move;
        if (isSolved(child, capacity)) return first;
        nodes += 1;
        if (nodes > HINT_MAX_NODES) return fallbackHint(posts, capacity);
        const key = normalizeKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ posts: child, first });
      }
    }
    frontier = next;
  }
  return fallbackHint(posts, capacity);
}

function fallbackHint(posts, capacity) {
  const moves = listMoves(posts, capacity);
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < moves.length; i += 1) {
    const score = moveScore(posts, moves[i], capacity);
    if (score > bestScore) {
      bestScore = score;
      best = moves[i];
    }
  }
  return best;
}

// Чем выше — тем «полезнее» ход: слияние с тем же цветом лучше переезда
// на пустой штырь, освобождение столбика целиком — лучше всего.
function moveScore(posts, move, capacity) {
  const group = takeTopGroup(posts, move.from);
  const target = posts[move.to];
  let score = 0;
  if (target.length > 0) score += 8 + group.count;
  else score -= 4;
  if (target.length + group.count === capacity && (target.length === 0 || target[0] === group.color)) score += 20;
  if (group.count === posts[move.from].length) score += 6;
  const rest = posts[move.from].length - group.count;
  if (rest > 0 && posts[move.from][rest - 1] === group.color) score -= 30;
  score += Math.min(freeSlots(posts, move.to, capacity), 3);
  return score;
}

// Полный поиск в глубину с отсечением по посещённым состояниям.
// Возвращает массив ходов или null.
export function solve(posts, capacity, maxNodes = SOLVE_MAX_NODES) {
  const seen = new Set();
  const path = [];
  let nodes = 0;

  function dfs(current, depth) {
    if (isSolved(current, capacity)) return true;
    if (depth >= SOLVE_MAX_DEPTH || nodes > maxNodes) return false;
    const key = normalizeKey(current);
    if (seen.has(key)) return false;
    seen.add(key);
    const moves = listMoves(current, capacity);
    moves.sort((a, b) => moveScore(current, b, capacity) - moveScore(current, a, capacity));
    for (let i = 0; i < moves.length; i += 1) {
      nodes += 1;
      if (nodes > maxNodes) return false;
      path.push(moves[i]);
      if (dfs(applyMove(current, moves[i].from, moves[i].to, capacity), depth + 1)) return true;
      path.pop();
    }
    return false;
  }

  return dfs(posts, 0) ? path.slice() : null;
}
