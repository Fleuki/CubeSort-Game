// Расчёт позиций под размер экрана. Ничего не рисует — только числа.

import { cubeSideHeight, BASE_RADIUS_RATIO } from './iso.js';

// Доли доступной высоты (без полос HUD). Поле — герой экрана,
// поэтому ему отдано больше половины.
const CITY_SHARE = 0.32;
const AIR_SHARE = 0.06;
const FIELD_SHARE = 0.62;

const HUD_TOP = 56;
const HUD_BOTTOM = 78;
const SIDE_MARGIN = 12;
const MIN_SIDE_MARGIN = 4;
const MIN_BASE_GAP = 8;
const MIN_CUBE_WIDTH = 40;
const MAX_CUBE_WIDTH = 104;
const STEP_SLACK = 0.5;
const CUBE_OF_STEP = 0.82;
const FIELD_USABLE = 0.8;
const STACK_ALLOWANCE = 1.6;
const ROW_GAP_SHARE = 0.05;
const SINGLE_ROW_LIMIT = 5;
const HIT_WIDTH = 1.2;
// Задний ряд чуть меньше переднего — иначе два ряда читаются как таблица.
const BACK_ROW_SCALE = 0.94;

// Вертикальный шаг стопки в долях ширины кубика: кубик рисуется
// в изометрии 2:1, поэтому по высоте он занимает меньше, чем по ширине.
const VERTICAL_UNIT = cubeSideHeight(0.5);

export function computeLayout(width, height, postCount, capacity) {
  const available = Math.max(200, height - HUD_TOP - HUD_BOTTOM);
  const cityHeight = available * CITY_SHARE;
  const fieldHeight = available * FIELD_SHARE;
  const fieldTop = HUD_TOP + cityHeight + available * AIR_SHARE;

  const rows = postCount > SINGLE_ROW_LIMIT ? 2 : 1;
  const perRow = Math.ceil(postCount / rows);
  const rowGap = rows > 1 ? fieldHeight * ROW_GAP_SHARE : 0;
  const rowHeight = (fieldHeight - rowGap * (rows - 1)) / rows;

  const cubeWidth = fitCubeWidth(width, perRow, rowHeight, capacity);
  const size = cubeWidth / 2;
  const step = cubeSideHeight(size);
  // Полная колонка: вместимость кубиков плюс половина верхнего ромба.
  const columnHeight = capacity * step + size * 0.5;
  // Ряды стоят единым блоком по центру поля: при вместимости 3 стопки
  // низкие, и прижимать их к краю — значит рвать экран пополам.
  const baseRadiusY = size * BASE_RADIUS_RATIO * 0.5;
  const blockHeight = columnHeight + baseRadiusY * 2;
  const groupHeight = rows * blockHeight + (rows - 1) * rowGap;
  const groupTop = fieldTop + Math.max(0, (fieldHeight - groupHeight) / 2);

  const spacing = stepFor(width, perRow, cubeWidth);
  const posts = [];
  for (let i = 0; i < postCount; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = i - row * perRow;
    const count = Math.min(perRow, postCount - row * perRow);
    const rowTop = groupTop + row * (blockHeight + rowGap);
    const rowWidth = count * spacing;
    const startX = (width - rowWidth) / 2 + spacing / 2;
    const scale = rows > 1 && row === 0 ? BACK_ROW_SCALE : 1;
    posts.push({
      index: i,
      x: startX + inRow * spacing,
      baseY: rowTop + columnHeight * scale,
      row,
      scale
    });
  }

  return {
    width,
    height,
    city: { x: 0, y: HUD_TOP, width, height: cityHeight },
    field: { x: 0, y: fieldTop, width, height: fieldHeight },
    posts,
    rows,
    size,
    cubeWidth,
    step,
    columnHeight,
    spacing,
    capacity
  };
}

function stepFor(width, perRow, cubeWidth) {
  // Если кубик упёрся в нижнюю границу, поле раздвигается за счёт полей
  // по краям, а не за счёт размера кубика.
  const wide = (width - SIDE_MARGIN * 2) / (perRow + STEP_SLACK);
  const needed = cubeWidth / CUBE_OF_STEP;
  if (needed <= wide) return wide;
  const tight = (width - MIN_SIDE_MARGIN * 2) / (perRow + STEP_SLACK);
  return Math.min(needed, tight);
}

function fitCubeWidth(width, perRow, rowHeight, capacity) {
  const step = (width - SIDE_MARGIN * 2) / (perRow + STEP_SLACK);
  const byWidth = step * CUBE_OF_STEP;
  const byHeight = (rowHeight * FIELD_USABLE) / ((capacity + STACK_ALLOWANCE) * VERTICAL_UNIT);
  // Подставки не должны слипаться: между соседними — минимум MIN_BASE_GAP.
  const byGap = (step - MIN_BASE_GAP) / BASE_RADIUS_RATIO;
  const fitted = Math.min(byWidth, byHeight, byGap);
  return Math.max(MIN_CUBE_WIDTH, Math.min(MAX_CUBE_WIDTH, fitted));
}

// Штыря больше нет, целиться в тонкий блин подставки невозможно, поэтому
// область тапа — вся колонка над подставкой, шире её в HIT_WIDTH раз.
export function hitTest(layout, px, py) {
  for (let i = 0; i < layout.posts.length; i += 1) {
    const post = layout.posts[i];
    const baseWidth = layout.size * post.scale * BASE_RADIUS_RATIO * 2;
    const half = (baseWidth * HIT_WIDTH) / 2;
    const top = post.baseY - layout.columnHeight * post.scale;
    const bottom = post.baseY + layout.size * post.scale * BASE_RADIUS_RATIO * 0.5;
    if (px >= post.x - half && px <= post.x + half && py >= top && py <= bottom) return i;
  }
  return -1;
}

// Экранная позиция центра верхней грани кубика на слоте slot (снизу вверх).
export function slotPosition(layout, postIndex, slot) {
  const post = layout.posts[postIndex];
  const scale = post.scale;
  return {
    x: post.x,
    y: post.baseY - layout.size * scale * 0.25 - (slot + 1) * layout.step * scale
  };
}
