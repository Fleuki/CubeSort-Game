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
// Радиус подставки в долях ширины кубика.
export const BASE_RADIUS_RATIO = 1.0;
// Подставка светлее тени, иначе низ стопки смазывается в тёмное пятно.
const BASE_TONE = 0.1;
const BASE_SHADOW_SPREAD = 1.35;
// Символ на боковой грани: доля ширины грани.
const SYMBOL_SCALE = 0.34;
const SYMBOL_DARK = -0.4;
const SYMBOL_LIGHT = 0.18;
// Выступы: кубики соединяются друг с другом, как детали конструктора.
const STUD_RADIUS = 0.13;
const STUD_HEIGHT = 0.1;
const STUD_INSET = 0.26;
const SINGLE_STUD_WIDTH = 56;
const SINGLE_STUD_RADIUS = 0.2;
const STUD_TOP_LIGHT = 0.16;
const STUD_SIDE_DARK = -0.12;
const STUD_STROKE_DARK = -0.45;

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

// Выступы на верхней грани. Рисуются только там, где верх виден: у верхнего
// кубика стопки, у поднятой группы и у одиночного кубика. Внутри стопки
// верхняя грань закрыта следующим кубиком — и это создаёт ощущение,
// что детали вставлены друг в друга.
export function drawStuds(ctx, x, y, size, colorIndex) {
  const base = PALETTE[colorIndex % PALETTE.length];
  const cubeWidth = size * 2;
  const height = cubeSideHeight(size) * STUD_HEIGHT;
  ctx.strokeStyle = shade(base, STUD_STROKE_DARK);
  ctx.lineWidth = STROKE_WIDTH;
  // Четыре мелких выступа на маленьком экране сливаются в кашу.
  if (cubeWidth < SINGLE_STUD_WIDTH) {
    stud(ctx, x, y, cubeWidth * SINGLE_STUD_RADIUS, height, base);
    return;
  }
  const radius = cubeWidth * STUD_RADIUS;
  const offset = 1 - 2 * STUD_INSET;
  for (let i = 0; i < 4; i += 1) {
    // Сетка 2x2 лежит в плоскости грани: ромбом, а не квадратом на экране.
    const u = i < 2 ? offset : -offset;
    const v = i % 2 === 0 ? offset : -offset;
    stud(ctx, x + (u - v) * (size / 2), y + (u + v) * (size / 4), radius, height, base);
  }
}

function stud(ctx, x, y, rx, height, base) {
  const ry = rx * 0.5;
  ctx.fillStyle = shade(base, STUD_SIDE_DARK);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(x - rx, y - height);
  ctx.ellipse(x, y - height, rx, ry, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = shade(base, STUD_TOP_LIGHT);
  ctx.beginPath();
  ctx.ellipse(x, y - height, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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




// Подставка: круглая деревянная площадка. Пустой столбик — это только она.
export function drawPostBase(ctx, x, baseY, size) {
  const baseRx = size * BASE_RADIUS_RATIO;
  const baseRy = baseRx / 2;
  // Пятно шире подставки: иначе ядро тени целиком уходит под неё
  // и контакт с землёй не читается.
  drawShadow(ctx, x, baseY, baseRy * 0.9, baseRx * 2 * BASE_SHADOW_SPREAD);

  ctx.fillStyle = shade(WOOD, BASE_TONE - 0.22);
  ctx.beginPath();
  ctx.ellipse(x, baseY + baseRy * 0.18, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(WOOD, BASE_TONE);
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, BASE_TONE - 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx * 0.72, baseRy * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}
