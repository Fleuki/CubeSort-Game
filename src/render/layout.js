// Расчёт позиций под размер экрана. Ничего не рисует — только числа.

import { cubeSideHeight } from './iso.js';

const CITY_SHARE = 0.42;
const HUD_TOP = 64;
const HUD_BOTTOM = 96;
const MIN_CUBE = 13;
const MAX_CUBE = 46;
const GAP_RATIO = 0.55;
const HIT_PADDING = 0.2;
const SIDE_MARGIN = 10;

export function computeLayout(width, height, postCount, capacity) {
  const cityHeight = Math.round(height * CITY_SHARE);
  const fieldTop = cityHeight + HUD_TOP * 0.2;
  const fieldBottom = height - HUD_BOTTOM;
  const fieldHeight = Math.max(120, fieldBottom - fieldTop);

  const rows = postCount > 5 ? 2 : 1;
  const perRow = Math.ceil(postCount / rows);

  // Размер кубика зажат и по ширине ряда, и по высоте столбика.
  const byWidth = (width - SIDE_MARGIN * 2) / (perRow * (2 + GAP_RATIO));
  const byHeight = (fieldHeight / rows) / (capacity * 0.95 + 2.1);
  const size = Math.max(MIN_CUBE, Math.min(MAX_CUBE, Math.min(byWidth, byHeight)));

  const step = cubeSideHeight(size);
  const stackHeight = capacity * step + size * 0.5;
  const rowBlock = stackHeight + size * 1.3;
  const rowGap = rows > 1 ? size * 0.7 : 0;
  const total = rows * rowBlock + (rows - 1) * rowGap;
  // Ряды столбиков центрируются в поле, иначе снизу остаётся дыра.
  const startY = fieldTop + Math.max(0, (fieldHeight - total) / 2);

  const posts = [];
  for (let i = 0; i < postCount; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = i - row * perRow;
    const count = Math.min(perRow, postCount - row * perRow);
    const spacing = size * (2 + GAP_RATIO);
    const rowWidth = count * spacing;
    const startX = (width - rowWidth) / 2 + spacing / 2;
    posts.push({
      index: i,
      x: startX + inRow * spacing,
      baseY: startY + rowBlock * (row + 1) + rowGap * row,
      row
    });
  }

  return {
    width,
    height,
    city: { x: 0, y: 0, width, height: cityHeight },
    posts,
    size,
    step,
    stackHeight,
    capacity
  };
}

// Хитбокс шире визуального штыря на 20% с каждой стороны — пальцу нужен запас.
export function hitTest(layout, px, py) {
  const half = layout.size * (1 + HIT_PADDING);
  for (let i = 0; i < layout.posts.length; i += 1) {
    const post = layout.posts[i];
    const top = post.baseY - layout.stackHeight - layout.size;
    const bottom = post.baseY + layout.size * 0.7;
    if (px >= post.x - half && px <= post.x + half && py >= top && py <= bottom) return i;
  }
  return -1;
}

// Экранная позиция центра верхней грани кубика на слоте slot (снизу вверх).
export function slotPosition(layout, postIndex, slot) {
  const post = layout.posts[postIndex];
  return {
    x: post.x,
    y: post.baseY - layout.size * 0.25 - (slot + 1) * layout.step
  };
}
