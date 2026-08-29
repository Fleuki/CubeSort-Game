// Обратная генерация: от решённого состояния идём назад по ходам,
// каждый из которых обратим валидным ходом игры. Поэтому записанная
// последовательность, прочитанная задом наперёд, — готовое решение,
// и уровень решаем по построению.
//
// Прямой ход отрывает ВСЮ верхнюю группу одного цвета, поэтому из
// решённого состояния прямых ходов нет вовсе. Обратный ход снимает
// k кубиков (1..длина верхней группы) и кладёт их на столбик другого
// цвета — тогда обратно они уедут одним валидным ходом.

import { createSolvedPosts, normalizeKey } from './state.js';
import { isSolved } from './rules.js';
import { levelConfig, modeConfig } from './modes.js';

const SHUFFLE_BASE = 30;
const SHUFFLE_PER_LEVEL = 4;
const SHUFFLE_CAP = 200;
const GREEDY_SHARE = 0.5;
const CANDIDATES = 12;
const TUTORIAL_LEVELS = 3;

// Кривая сложности берётся из таблицы режима, здесь её нет.
export function shuffleCount(mode, id) {
  const config = modeConfig(mode);
  // Первые уровни — обучение без текста: решаются за два-три хода.
  // В сложном режиме обучения нет.
  if (config.tutorial && id <= TUTORIAL_LEVELS) return id + 1;
  const base = Math.min(SHUFFLE_BASE + SHUFFLE_PER_LEVEL * id, SHUFFLE_CAP);
  return Math.max(2, Math.round(base * config.shuffleFactor));
}

// Детерминированный ГПСЧ (xorshift32): по seed уровень воспроизводится
// один в один и в браузере, и в Node.
export function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function topRun(post) {
  if (post.length === 0) return null;
  const color = post[post.length - 1];
  let count = 1;
  while (count < post.length && post[post.length - 1 - count] === color) count += 1;
  return { color, count };
}

// Все обратные ходы: снять k кубиков со столбика from и положить на to,
// где to пуст или его верхний кубик другого цвета.
function reverseMoves(posts, capacity) {
  const moves = [];
  for (let from = 0; from < posts.length; from += 1) {
    const run = topRun(posts[from]);
    if (!run) continue;
    for (let to = 0; to < posts.length; to += 1) {
      if (to === from) continue;
      const target = posts[to];
      if (target.length > 0 && target[target.length - 1] === run.color) continue;
      const free = capacity - target.length;
      if (free === 0) continue;
      const maxTake = Math.min(run.count, free);
      for (let k = 1; k <= maxTake; k += 1) {
        // Обратный ход обязан быть обратим прямым: прямой ход to->from
        // требует, чтобы верх from остался того же цвета (k < run.count)
        // либо чтобы from полностью опустел.
        const emptiesSource = k === posts[from].length;
        if (k === run.count && !emptiesSource) continue;
        // Перенос всего содержимого на пустой штырь даёт то же состояние
        // с точностью до перестановки столбиков — смысла в нём нет.
        if (target.length === 0 && emptiesSource) continue;
        moves.push({ from, to, count: k });
      }
    }
  }
  return moves;
}

function applyReverse(posts, move) {
  const next = posts.map((post) => post.slice());
  for (let i = 0; i < move.count; i += 1) next[move.to].push(next[move.from].pop());
  return next;
}

// Перемешанность: сколько цветовых сегментов в столбиках. Чем больше —
// тем дальше состояние от собранного. Дешёвая замена запуску солвера.
function mixedness(posts) {
  let total = 0;
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    if (post.length === 0) continue;
    let runs = 1;
    for (let j = 1; j < post.length; j += 1) {
      if (post[j] !== post[j - 1]) runs += 1;
    }
    total += runs;
  }
  return total;
}

function randomWalk(config, steps, random) {
  let posts = createSolvedPosts(config.colors, config.capacity, config.posts);
  // Обратный ход from->to соответствует прямому ходу to->from.
  const solution = [];
  for (let i = 0; i < steps; i += 1) {
    const moves = reverseMoves(posts, config.capacity);
    if (moves.length === 0) break;
    let move;
    if (random() < GREEDY_SHARE) {
      // Жадно — но с шумом, иначе блуждание вырождается в один и тот же путь.
      let bestScore = -Infinity;
      for (let m = 0; m < moves.length; m += 1) {
        const score = mixedness(applyReverse(posts, moves[m])) + random() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          move = moves[m];
        }
      }
    } else {
      move = moves[Math.min(Math.floor(random() * moves.length), moves.length - 1)];
    }
    posts = applyReverse(posts, move);
    solution.push({ from: move.to, to: move.from });
  }
  solution.reverse();
  return { posts, solution, score: mixedness(posts) };
}

export function generateLevel(mode, id, seed) {
  const config = levelConfig(mode, id);
  const steps = shuffleCount(mode, id);
  let best = null;
  for (let candidate = 0; candidate < CANDIDATES; candidate += 1) {
    const random = makeRandom(seed + candidate * 2654435761);
    const walk = randomWalk(config, steps, random);
    if (isSolved(walk.posts, config.capacity)) continue;
    if (!best || walk.score > best.score) best = walk;
  }
  if (!best) return null;
  return {
    id,
    mode,
    seed,
    capacity: config.capacity,
    colors: config.colors,
    posts: best.posts,
    parMoves: best.solution.length,
    solution: best.solution
  };
}
