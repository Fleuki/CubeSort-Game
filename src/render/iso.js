// Изометрия 2:1 и отрисовка деревянных деталей. Модуль только рисует,
// состояние не трогает. Тени — через src/render/shadow.js, своей
// реализации теней здесь нет.

import { drawShadow } from './shadow.js';

export const PALETTE = ['#D4553F', '#E2A238', '#5B9750', '#3B71A4', '#7A57A3', '#3E9E93', '#C9628C'];
export const SKY_TOP = '#F2EADA';
export const TABLE = '#DFD0B4';
export const WOOD = '#9A7B52';
export const WOOD_DARK = '#7E6242';
export const INK = '#2E2A24';

const TOP_LIGHT = 0.18;
const LEFT_DARK = 0.14;
const RIGHT_DARK = 0.34;
const STROKE_DARK = 0.5;
const STROKE_WIDTH = 1.5;
const SIDE_RATIO = 0.82;
// Штырь торчит над верхним кубиком на эту долю высоты кубика: короткий
// толстый шип читается как крепление, длинная спица — как шампур.
export const PEG_OVERHANG = 0.22;
// Радиус подставки в долях ширины кубика.
export const BASE_RADIUS_RATIO = 1.0;
// Толщина штыря в долях ширины кубика.
const PEG_WIDTH = 0.16;
const BASE_TONE = -0.16;
const PEG_TONE = 0.06;
// Отверстие под штырь: большая полуось в долях ширины кубика.
const HOLE_RADIUS = 0.22;
const HOLE_DARK = -0.55;
// Символ на боковой грани: доля ширины грани.
const SYMBOL_SCALE = 0.34;
const SYMBOL_DARK = -0.4;
const SYMBOL_LIGHT = 0.18;
const GHOST_LINE = 'rgba(92, 70, 44, 0.16)';

// Символы различают цвета для дальтоников. Живут на боковых гранях:
// на верхней их перекрывало бы отверстие, да и видно её только у верхнего
// кубика стопки.
const SYMBOLS = ['circle', 'square', 'triangle', 'cross', 'star', 'diamond', 'ring'];

const shadeCache = new Map();

export function shade(hex, amount) {
  const key = `${hex}${amount}`;
  const cached = shadeCache.get(key);
  if (cached) return cached;
  let r;
  let g;
  let b;
  if (hex.charCodeAt(0) === 35) {
    const num = parseInt(hex.slice(1), 16);
    r = (num >> 16) & 255;
    g = (num >> 8) & 255;
    b = num & 255;
  } else {
    // Осветлять уже осветлённый цвет — обычное дело, поэтому rgb() тоже парсим.
    const parts = hex.match(/\d+/g);
    r = Number(parts[0]);
    g = Number(parts[1]);
    b = Number(parts[2]);
  }
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  const result = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  shadeCache.set(key, result);
  return result;
}

export function cubeSideHeight(size) {
  return size * SIDE_RATIO;
}

// (x, y) — центр верхней грани. size — половина ширины ромба.
export function drawCube(ctx, x, y, size, colorIndex, squash = 1) {
  const base = PALETTE[colorIndex % PALETTE.length];
  const w = size;
  const h = size / 2;
  const side = cubeSideHeight(size) * squash;

  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fillStyle = shade(base, TOP_LIGHT);
  ctx.fill();
  ctx.strokeStyle = shade(base, -STROKE_DARK);
  ctx.lineWidth = STROKE_WIDTH;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h + side);
  ctx.lineTo(x - w, y + side);
  ctx.closePath();
  ctx.fillStyle = shade(base, -LEFT_DARK);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h + side);
  ctx.lineTo(x + w, y + side);
  ctx.closePath();
  ctx.fillStyle = shade(base, -RIGHT_DARK);
  ctx.fill();
  ctx.stroke();

  const faceY = y + h / 2 + side / 2;
  drawSymbol(ctx, x - w / 2, faceY, size, 0.5, colorIndex, shade(base, -LEFT_DARK));
  drawSymbol(ctx, x + w / 2, faceY, size, -0.5, colorIndex, shade(base, -RIGHT_DARK));
}

// Символ наследует наклон грани: skew = 0.5 для левой, -0.5 для правой.
// Это оттиск, а не наклейка — тёмный контур плюс светлая линия снизу.
function drawSymbol(ctx, cx, cy, size, skew, colorIndex, faceColor) {
  const r = size * SYMBOL_SCALE * 0.5;
  const line = Math.max(1, size * 0.075);
  ctx.save();
  ctx.transform(1, skew, 0, 1, cx, cy);
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(faceColor, SYMBOL_LIGHT);
  symbolPath(ctx, SYMBOLS[colorIndex % SYMBOLS.length], r, line * 0.55);
  ctx.stroke();
  ctx.strokeStyle = shade(faceColor, SYMBOL_DARK);
  symbolPath(ctx, SYMBOLS[colorIndex % SYMBOLS.length], r, 0);
  ctx.stroke();
  ctx.restore();
}

function symbolPath(ctx, kind, r, dy) {
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(0, dy, r * 0.72, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(-r * 0.62, -r * 0.62 + dy, r * 1.24, r * 1.24);
      break;
    case 'triangle':
      ctx.moveTo(0, -r * 0.78 + dy);
      ctx.lineTo(r * 0.74, r * 0.58 + dy);
      ctx.lineTo(-r * 0.74, r * 0.58 + dy);
      ctx.closePath();
      break;
    case 'cross':
      ctx.moveTo(-r * 0.66, -r * 0.66 + dy);
      ctx.lineTo(r * 0.66, r * 0.66 + dy);
      ctx.moveTo(r * 0.66, -r * 0.66 + dy);
      ctx.lineTo(-r * 0.66, r * 0.66 + dy);
      break;
    case 'star':
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = Math.cos(angle) * r * 0.9;
        const py = Math.sin(angle) * r * 0.9 + dy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        const inner = angle + Math.PI / 5;
        ctx.lineTo(Math.cos(inner) * r * 0.4, Math.sin(inner) * r * 0.4 + dy);
      }
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(0, -r * 0.88 + dy);
      ctx.lineTo(r * 0.68, dy);
      ctx.lineTo(0, r * 0.88 + dy);
      ctx.lineTo(-r * 0.68, dy);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, dy, r * 0.82, 0, Math.PI * 2);
      ctx.moveTo(r * 0.36, dy);
      ctx.arc(0, dy, r * 0.36, 0, Math.PI * 2);
      break;
  }
}

// Отверстие в верхней грани: кубик надет на штырь, а не стоит рядом с ним.
export function drawHole(ctx, x, y, size, colorIndex) {
  const base = PALETTE[colorIndex % PALETTE.length];
  const rx = size * 2 * HOLE_RADIUS;
  const ry = rx / 2;
  ctx.fillStyle = shade(base, HOLE_DARK);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Светлая дуга по нижнему краю читается как внутренняя стенка.
  ctx.strokeStyle = shade(base, -0.18);
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.beginPath();
  ctx.ellipse(x, y + ry * 0.12, rx * 0.92, ry * 0.92, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

// Свободное место над стопкой: контур кубика без заливки. Игрок
// пересчитывает пустые слоты глазами, палка для этого не нужна.
export function drawGhostSlot(ctx, x, y, size, fade = 1) {
  const w = size;
  ctx.save();
  ctx.globalAlpha = fade;
  const h = size / 2;
  const side = cubeSideHeight(size);
  ctx.strokeStyle = GHOST_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x - w, y + side);
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h + side);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + side);
  ctx.stroke();
  ctx.restore();
}

// Короткий шип над верхним кубиком. Рисуется после отверстия, поэтому
// выходит из кубика, а не упирается в него.
export function drawPegStub(ctx, x, topY, size) {
  const w = size * 2 * PEG_WIDTH;
  const height = cubeSideHeight(size) * PEG_OVERHANG;
  const top = topY - height;
  ctx.fillStyle = shade(WOOD, PEG_TONE);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, top, w, height + w * 0.3, w * 0.35);
  ctx.fill();
  ctx.fillStyle = shade(WOOD, PEG_TONE + 0.12);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, top, w * 0.42, height + w * 0.2, w * 0.2);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, -0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, top + w * 0.14, w / 2, w * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// Подставка: на пару тонов темнее штыря, иначе нижний кубик сливается с ней.
export function drawPostBase(ctx, x, baseY, size) {
  const baseRx = size * BASE_RADIUS_RATIO;
  const baseRy = baseRx / 2;
  drawShadow(ctx, x, baseY, baseRy * 0.9, baseRx * 2);

  ctx.fillStyle = shade(WOOD, BASE_TONE - 0.12);
  ctx.beginPath();
  ctx.ellipse(x, baseY + baseRy * 0.18, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(WOOD, BASE_TONE);
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, BASE_TONE - 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx * 0.72, baseRy * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}
