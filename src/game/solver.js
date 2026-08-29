// Поиск решения. В рантайме вызывается ТОЛЬКО по кнопке подсказки:
// BFS по нормализованным состояниям, затем — добор в глубину в пределах
// бюджета времени. Подсказка выдаётся только тогда, когда решение целиком
// найдено, поэтому ход в тупик невозможен. Полный поиск (solve) —
// для офлайн-проверки уровней в tools/gen-levels.js.

import { normalizeKey } from './state.js';
import { applyMove, listMoves, isSolved, takeTopGroup, freeSlots } from './rules.js';

const HINT_BUDGET_MS = 250;
const HINT_BFS_DEPTH = 18;
const HINT_BFS_NODES = 120000;
const HINT_DFS_NODES = 300000;
const TIME_CHECK_MASK = 511;
const SOLVE_MAX_NODES = 400000;
const SOLVE_MAX_DEPTH = 220;
const OPTIMAL_MAX_DEPTH = 20;
const OPTIMAL_MAX_NODES = 400000;

// Подсказка: сначала BFS по нормализованным состояниям — он даёт кратчайший
// путь и заодно доказывает нерешаемость, если пространство обошли целиком.
// Если BFS упёрся в потолок — добираем в глубину остатком бюджета.
// Возвращаем ход, только когда решение найдено полностью; иначе null.
export function findHint(posts, capacity, budgetMs = HINT_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  const seen = new Set([normalizeKey(posts)]);
  let frontier = [{ posts, first: null }];
  let nodes = 0;
  let truncated = false;

  for (let depth = 0; depth < HINT_BFS_DEPTH && frontier.length > 0; depth += 1) {
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
        if (nodes > HINT_BFS_NODES || ((nodes & TIME_CHECK_MASK) === 0 && Date.now() >= deadline)) {
          truncated = true;
          break;
        }
        const key = normalizeKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ posts: child, first });
      }
      if (truncated) break;
    }
    if (truncated) break;
    if (depth === HINT_BFS_DEPTH - 1 && next.length > 0) truncated = true;
    frontier = next;
  }

  // Пространство обошли целиком и победы в нём нет — позиция мертва,
  // добирать в глубину нечего.
  if (!truncated) return null;

  if (Date.now() >= deadline) return null;
  const path = solve(posts, capacity, HINT_DFS_NODES, deadline);
  return path && path.length > 0 ? path[0] : null;
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
export function solve(posts, capacity, maxNodes = SOLVE_MAX_NODES, deadline = Infinity) {
  const seen = new Set();
  const path = [];
  let nodes = 0;
  let expired = false;

  function dfs(current, depth) {
    if (isSolved(current, capacity)) return true;
    if (depth >= SOLVE_MAX_DEPTH || nodes > maxNodes || expired) return false;
    const key = normalizeKey(current);
    if (seen.has(key)) return false;
    seen.add(key);
    const moves = listMoves(current, capacity);
    moves.sort((a, b) => moveScore(current, b, capacity) - moveScore(current, a, capacity));
    for (let i = 0; i < moves.length; i += 1) {
      nodes += 1;
      if (nodes > maxNodes) return false;
      if ((nodes & TIME_CHECK_MASK) === 0 && Date.now() >= deadline) {
        expired = true;
        return false;
      }
      path.push(moves[i]);
      if (dfs(applyMove(current, moves[i].from, moves[i].to, capacity), depth + 1)) return true;
      path.pop();
    }
    return false;
  }

  return dfs(posts, 0) ? path.slice() : null;
}

// Нижняя оценка числа оставшихся ходов: для каждого цвета, разбросанного
// по k столбикам, нужно минимум k-1 ходов, и один ход уменьшает эту сумму
// не больше чем на единицу. Оценка допустимая, значит IDA* даёт оптимум.
function scatterHeuristic(posts, colors) {
  let total = 0;
  for (let color = 0; color < colors; color += 1) {
    let count = 0;
    for (let i = 0; i < posts.length; i += 1) {
      if (posts[i].indexOf(color) >= 0) count += 1;
    }
    if (count > 0) total += count - 1;
  }
  return total;
}

function colorCount(posts) {
  let max = -1;
  for (let i = 0; i < posts.length; i += 1) {
    for (let j = 0; j < posts[i].length; j += 1) {
      if (posts[i][j] > max) max = posts[i][j];
    }
  }
  return max + 1;
}

// Оптимальное число ходов: IDA* по нормализованному состоянию с потолком
// по глубине. null — оптимум за потолком (или за лимитом узлов).
export function findOptimal(posts, capacity, maxDepth = OPTIMAL_MAX_DEPTH, maxNodes = OPTIMAL_MAX_NODES) {
  const colors = colorCount(posts);
  let nodes = 0;
  let overflow = false;

  function search(current, g, limit, seen) {
    const h = scatterHeuristic(current, colors);
    if (h === 0 && isSolved(current, capacity)) return g;
    const f = g + h;
    if (f > limit) return f;
    if (nodes > maxNodes) {
      overflow = true;
      return Infinity;
    }
    let next = Infinity;
    const moves = listMoves(current, capacity);
    moves.sort((a, b) => moveScore(current, b, capacity) - moveScore(current, a, capacity));
    for (let i = 0; i < moves.length; i += 1) {
      nodes += 1;
      const child = applyMove(current, moves[i].from, moves[i].to, capacity);
      const key = normalizeKey(child);
      const best = seen.get(key);
      if (best !== undefined && best <= g + 1) continue;
      seen.set(key, g + 1);
      const result = search(child, g + 1, limit, seen);
      if (result <= limit) return result;
      if (result < next) next = result;
    }
    return next;
  }

  let limit = scatterHeuristic(posts, colors);
  while (limit <= maxDepth) {
    const seen = new Map([[normalizeKey(posts), 0]]);
    const result = search(posts, 0, limit, seen);
    if (overflow) return null;
    if (result <= limit) return result;
    if (result === Infinity) return null;
    limit = result;
  }
  return null;
}
