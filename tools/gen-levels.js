// Офлайн-генерация уровней. Запускается вручную в Node, в игру не входит.
//
//   node tools/gen-levels.js            — перегенерировать levels/levels.json
//   node tools/gen-levels.js --check N  — проверить решаемость N уровней
//
// Помимо levels.json пишется levels/levels.js с тем же содержимым:
// игра открывается двойным кликом по index.html, а fetch по file://
// заблокирован, поэтому уровни подключаются как модуль.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLevel } from '../src/game/generator.js';
import { solve } from '../src/game/solver.js';
import { canMove, applyMove, isSolved } from '../src/game/rules.js';

const LEVEL_COUNT = 60;
const SEED_BASE = 7919;
const SEED_OFFSET = 13;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function levelSeed(id) {
  return (id * SEED_BASE + SEED_OFFSET) >>> 0;
}

// Уровень с посчитанным par: длина решения, найденного солвером,
// но не длиннее пути генератора.
export function buildLevel(id) {
  const level = generateLevel(id, levelSeed(id));
  if (!level) return null;
  const solution = solve(level.posts, level.capacity);
  const par = solution ? Math.min(solution.length, level.parMoves) : level.parMoves;
  return {
    id: level.id,
    seed: level.seed,
    capacity: level.capacity,
    colors: level.colors,
    posts: level.posts,
    parMoves: par
  };
}

function verify(level) {
  const solution = solve(level.posts, level.capacity);
  if (!solution) return false;
  let posts = level.posts.map((post) => post.slice());
  for (let i = 0; i < solution.length; i += 1) {
    if (!canMove(posts, solution[i].from, solution[i].to, level.capacity)) return false;
    posts = applyMove(posts, solution[i].from, solution[i].to, level.capacity);
  }
  return isSolved(posts, level.capacity);
}

function generateAll() {
  const levels = [];
  for (let id = 1; id <= LEVEL_COUNT; id += 1) {
    const level = buildLevel(id);
    if (!level) throw new Error(`уровень ${id} не сгенерирован`);
    levels.push(level);
  }
  // Каждый уровень в одну строку — иначе массивы столбиков раздувают файл.
  const rows = levels.map((level) => `  ${JSON.stringify(level)}`).join(',\n');
  writeFileSync(join(ROOT, 'levels/levels.json'), `{\n "version": 1,\n "levels": [\n${rows}\n ]\n}\n`);
  const module = [
    '// Сгенерировано tools/gen-levels.js. Руками не править.',
    `export const LEVELS = ${JSON.stringify(levels)};`,
    ''
  ].join('\n');
  writeFileSync(join(ROOT, 'levels/levels.js'), module);
  const parSum = levels.reduce((acc, level) => acc + level.parMoves, 0);
  process.stdout.write(`Записано ${levels.length} уровней, средний par ${(parSum / levels.length).toFixed(1)}\n`);
}

function check(count) {
  let failed = 0;
  const started = Date.now();
  for (let id = 1; id <= count; id += 1) {
    const level = buildLevel(id);
    if (!level || !verify(level)) {
      failed += 1;
      process.stdout.write(`уровень ${id}: НЕ РЕШАЕТСЯ\n`);
    }
    if (id % 100 === 0) process.stdout.write(`  проверено ${id}\n`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`Проверено ${count} уровней за ${seconds} с, провалов: ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

const args = process.argv.slice(2);
const checkIndex = args.indexOf('--check');
if (checkIndex >= 0) check(Number(args[checkIndex + 1]) || 100);
else generateAll();
