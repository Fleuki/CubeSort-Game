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
import { solve, findOptimal } from '../src/game/solver.js';
import { canMove, applyMove, isSolved } from '../src/game/rules.js';

const LEVEL_COUNT = 60;
const SEED_BASE = 7919;
const SEED_OFFSET = 13;
const PAR_MAX_DEPTH = 20;
const INEXACT_PAR_FACTOR = 0.8;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function levelSeed(id) {
  return (id * SEED_BASE + SEED_OFFSET) >>> 0;
}

// par — оптимальное число ходов (IDA* по нормализованному состоянию).
// Длина обратного пути генератора почти всегда больше оптимума, по ней
// три звезды получили бы все. Если оптимум за потолком глубины —
// помечаем par неточным и берём 0.8 обратного пути.
export function buildLevel(id) {
  const level = generateLevel(id, levelSeed(id));
  if (!level) return null;
  const optimal = findOptimal(level.posts, level.capacity, PAR_MAX_DEPTH);
  const built = {
    id: level.id,
    seed: level.seed,
    capacity: level.capacity,
    colors: level.colors,
    posts: level.posts,
    parMoves: optimal === null ? Math.max(1, Math.round(level.parMoves * INEXACT_PAR_FACTOR)) : optimal
  };
  if (optimal === null) built.parExact = false;
  built.walkMoves = level.parMoves;
  return built;
}

// walkMoves нужен только для лога проверки, в уровень он не пишется.
function stripDiagnostics(level) {
  const copy = { ...level };
  delete copy.walkMoves;
  return copy;
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
  const rows = levels.map((level) => `  ${JSON.stringify(stripDiagnostics(level))}`).join(',\n');
  writeFileSync(join(ROOT, 'levels/levels.json'), `{\n "version": 1,\n "levels": [\n${rows}\n ]\n}\n`);
  const module = [
    '// Сгенерировано tools/gen-levels.js. Руками не править.',
    `export const LEVELS = ${JSON.stringify(levels.map(stripDiagnostics))};`,
    ''
  ].join('\n');
  writeFileSync(join(ROOT, 'levels/levels.js'), module);
  const parSum = levels.reduce((acc, level) => acc + level.parMoves, 0);
  const walkSum = levels.reduce((acc, level) => acc + level.walkMoves, 0);
  const inexact = levels.filter((level) => level.parExact === false).length;
  process.stdout.write(
    `Записано ${levels.length} уровней, средний par ${(parSum / levels.length).toFixed(1)}, ` +
    `средний обратный путь ${(walkSum / levels.length).toFixed(1)}, неточных par: ${inexact}\n`
  );
}

function check(count) {
  let failed = 0;
  let inexact = 0;
  let parSum = 0;
  let walkSum = 0;
  const started = Date.now();
  for (let id = 1; id <= count; id += 1) {
    const level = buildLevel(id);
    if (!level || !verify(level)) {
      failed += 1;
      process.stdout.write(`уровень ${id}: НЕ РЕШАЕТСЯ\n`);
      continue;
    }
    parSum += level.parMoves;
    walkSum += level.walkMoves;
    if (level.parExact === false) inexact += 1;
    if (id <= 10 || id % 100 === 0) {
      const mark = level.parExact === false ? ' (par неточный)' : '';
      process.stdout.write(
        `  уровень ${id}: par ${level.parMoves}, обратный путь ${level.walkMoves}${mark}\n`
      );
    }
  }
  process.stdout.write(
    `Средний par ${(parSum / count).toFixed(1)} против ${(walkSum / count).toFixed(1)} у обратного пути, ` +
    `неточных par: ${inexact}\n`
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`Проверено ${count} уровней за ${seconds} с, провалов: ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

const args = process.argv.slice(2);
const checkIndex = args.indexOf('--check');
if (checkIndex >= 0) check(Number(args[checkIndex + 1]) || 100);
else generateAll();
