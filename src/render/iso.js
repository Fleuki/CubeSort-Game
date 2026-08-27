// Изометрия 2:1 и отрисовка деревянных деталей. Модуль только рисует,
// состояние не трогает. Тени — через src/render/shadow.js, своей
// реализации теней здесь нет.

import { drawShadow } from './shadow.js';

export const PALETTE = ['#D4553F', '#E2A238', '#5B9750', '#3B71A4', '#7A57A3', '#3E9E93', '#C9628C'];
export const SKY_TOP = '#F2EADA';
export const TABLE = '#DFD0B4';
// Фон игровой зоны на 6-7% темнее стола и заметно холоднее: жёлтый
// кубик на тёплом песке сливался с фоном. Оттенок подобран по
// максимуму цветового расстояния до самой светлой грани палитры.
export const FIELD = '#D0C6B0';
export const WOOD = '#9A7B52';
export const WOOD_DARK = '#7E6242';
export const INK = '#2E2A24';

const TOP_LIGHT = 0.18;
const LEFT_DARK = 0.14;
const RIGHT_DARK = 0.34;
// Обводка деталей: одна на всю игру, город рисуется ей же.
export const OUTLINE_DARK = 0.5;
export const OUTLINE_WIDTH = 1.5;
const SIDE_RATIO = 0.82;
// Радиус подставки — полудиагональ нижней грани кубика с полем 16%.
// Значение в полуширинах кубика, оно же доля диаметра от ширины кубика.
export const BASE_RADIUS_RATIO = 1.16;
// Толщина подставки в пикселях: плоский блин не читается как деталь.
const BASE_THICKNESS = 5;
// Подставка светлее тени, иначе низ стопки смазывается в тёмное пятно.
const BASE_TONE = 0.1;
const BASE_SHADOW_SPREAD = 1.35;
// Выемка в пустой подставке: пустой столбик — главный ресурс игрока,
// он должен находиться взглядом мгновенно.
const RECESS_DARK = -0.26;
const RECESS_EDGE_LIGHT = 0.22;
// Крышка собранного столбика — та же плита, что на плоских крышах города.
const CAP_OVERHANG = 0.08;
const CAP_HEIGHT = 0.18;
const CAP_DARK = -0.18;
// Символ на боковой грани: доля ширины грани.
const SYMBOL_SCALE = 0.44;
const SYMBOL_DARK = -0.52;
const SYMBOL_LIGHT = 0.18;
// Выступ: кубики соединяются друг с другом, как детали конструктора.
// Он всегда один и всегда по центру — разные выступы у разных рядов
// читались как разные детали.
const STUD_RADIUS = 0.2;
const STUD_HEIGHT = 0.1;
// Меньше двух пикселей выступ превращается в грязную точку — у мелких
// кубиков города его лучше не рисовать вовсе.
const MIN_STUD_RADIUS = 2;
const STUD_TOP_LIGHT = 0.16;
const STUD_SIDE_DARK = -0.12;
const STUD_STROKE_DARK = -0.45;
// Окно города: тёплый квадрат тем же оттиском, что и символы.
const WINDOW_LIT = '#FFD98A';
const WINDOW_SCALE = 0.26;
// Узкое вертикальное окно стеклянного города — в долях квадратного.
const WINDOW_TALL_WIDTH = 0.45;
const WINDOW_TALL_HEIGHT = 1.35;
const WINDOW_DARK = -0.45;

// Символы различают цвета для дальтоников. Живут на боковых гранях:
// на верхней их перекрывало бы отверстие, да и видно её только у верхнего
// кубика стопки.
const SYMBOLS = ['circle', 'square', 'triangle', 'cross', 'star', 'diamond', 'ring'];

const shadeCache = new Map();

function channels(hex) {
  if (hex.charCodeAt(0) === 35) {
    const num = parseInt(hex.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  // Осветлять уже осветлённый цвет — обычное дело, поэтому rgb() тоже парсим.
  const parts = hex.match(/\d+/g);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function shade(hex, amount) {
  const key = `${hex}${amount}`;
  const cached = shadeCache.get(key);
  if (cached) return cached;
  const parsed = channels(hex);
  let r = parsed[0];
  let g = parsed[1];
  let b = parsed[2];
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

// Смесь двух цветов: нужна, чтобы стык зон остался тем же цветом,
// что и раньше, а ниже него фон уходил в другой тон.
export function mix(from, to, t) {
  const a = channels(from);
  const b = channels(to);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)}, ${Math.round(a[1] + (b[1] - a[1]) * k)}, ${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

export function cubeSideHeight(size) {
  return size * SIDE_RATIO;
}

// (x, y) — центр верхней грани. size — половина ширины ромба.
export function drawCube(ctx, x, y, size, colorIndex, squash = 1) {
  drawBlock(ctx, x, y, size, PALETTE[colorIndex % PALETTE.length], squash, colorIndex, false);
}

// Один рендер деталей на всю игру: и поле, и город. base — цвет детали,
// squash сжимает только боковые грани, symbol — индекс символа на них
// (-1 — без символа). style — отделка города: окно на боковых гранях
// и своя обводка. У игрового поля стиля нет, объект там не создаётся.
export function drawBlock(ctx, x, y, size, base, squash = 1, symbol = -1, style = null) {
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
  ctx.strokeStyle = style && style.outline ? style.outline : shade(base, -OUTLINE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h + side);
  ctx.lineTo(x - w, y + side);
  ctx.closePath();
  const leftFace = shade(base, -LEFT_DARK);
  ctx.fillStyle = leftFace;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h + side);
  ctx.lineTo(x + w, y + side);
  ctx.closePath();
  const rightFace = shade(base, -RIGHT_DARK);
  ctx.fillStyle = rightFace;
  ctx.fill();
  ctx.stroke();

  const faceY = y + h / 2 + side / 2;
  if (symbol >= 0) {
    drawSymbol(ctx, x - w / 2, faceY, size, 0.5, symbol, leftFace);
    drawSymbol(ctx, x + w / 2, faceY, size, -0.5, symbol, rightFace);
  } else if (style && style.window) {
    drawWindow(ctx, x - w / 2, faceY, size, 0.5, leftFace, style.window);
    drawWindow(ctx, x + w / 2, faceY, size, -0.5, rightFace, style.window);
  }
}

// Выступ на верхней грани. Рисуется только там, где верх виден: у верхнего
// кубика стопки, у поднятой группы и у одиночного кубика. Внутри стопки
// верхняя грань закрыта следующим кубиком — и это создаёт ощущение,
// что детали вставлены друг в друга.
export function drawStuds(ctx, x, y, size, colorIndex) {
  drawStud(ctx, x, y, size, PALETTE[colorIndex % PALETTE.length]);
}

export function drawStud(ctx, x, y, size, base, outline) {
  const radius = size * 2 * STUD_RADIUS;
  if (radius < MIN_STUD_RADIUS) return;
  ctx.strokeStyle = outline || shade(base, STUD_STROKE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  stud(ctx, x, y, radius, cubeSideHeight(size) * STUD_HEIGHT, base);
}

// Крышка собранного столбика: плоская плита поверх верхнего кубика.
// Признак «столбик готов» должен читаться за долю секунды, а не
// вычитываться из совпадения цветов.
export function drawCap(ctx, x, topY, size, colorIndex, squash = 1) {
  const base = shade(PALETTE[colorIndex % PALETTE.length], CAP_DARK);
  const half = size * (1 + CAP_OVERHANG);
  const height = cubeSideHeight(size) * CAP_HEIGHT * squash;
  drawBlock(ctx, x, topY - height, half, base, height / cubeSideHeight(half));
}

export function capHeight(size) {
  return cubeSideHeight(size) * CAP_HEIGHT;
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

// Окно в городе — тот же оттиск, что и символ: тёплая заливка,
// тёмный контур сверху и светлая линия снизу. Форма зависит от
// материала: WINDOW_SQUARE у дерева и камня, WINDOW_TALL у стекла.
export const WINDOW_SQUARE = 1;
export const WINDOW_TALL = 2;

function drawWindow(ctx, cx, cy, size, skew, faceColor, kind) {
  const r = size * WINDOW_SCALE * 0.5;
  const rx = kind === WINDOW_TALL ? r * WINDOW_TALL_WIDTH : r;
  const ry = kind === WINDOW_TALL ? r * WINDOW_TALL_HEIGHT : r;
  ctx.save();
  ctx.transform(1, skew, 0, 1, cx, cy);
  ctx.fillStyle = WINDOW_LIT;
  ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
  ctx.lineWidth = Math.max(0.6, size * 0.05);
  ctx.strokeStyle = shade(faceColor, WINDOW_DARK);
  ctx.beginPath();
  ctx.moveTo(-rx, ry);
  ctx.lineTo(-rx, -ry);
  ctx.lineTo(rx, -ry);
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
// (x, baseY) — центр нижней грани нижнего кубика, он же центр подставки.
export function drawPostBase(ctx, x, baseY, size, empty = false) {
  const baseRx = size * BASE_RADIUS_RATIO;
  const baseRy = baseRx / 2;
  const thickness = Math.max(2, BASE_THICKNESS * (size / 30));
  const bottomY = baseY + thickness;
  // Контактная тень строится от нижнего эллипса подставки. Пятно шире
  // самой подставки: иначе ядро целиком уходит под неё.
  drawShadow(ctx, x, bottomY, thickness, baseRx * 2 * BASE_SHADOW_SPREAD);

  // Боковая стенка: нижний эллипс, вертикальные края, верхний эллипс.
  ctx.fillStyle = shade(WOOD, BASE_TONE - 0.22);
  ctx.beginPath();
  ctx.ellipse(x, bottomY, baseRx, baseRy, 0, 0, Math.PI);
  ctx.lineTo(x - baseRx, baseY);
  ctx.ellipse(x, baseY, baseRx, baseRy, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(WOOD, BASE_TONE);
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  if (empty) drawRecess(ctx, x, baseY, size);
  else {
    ctx.strokeStyle = shade(WOOD, BASE_TONE - 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, baseY, baseRx * 0.74, baseRy * 0.74, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Вдавленная выемка под кубик: тёмный эллипс размером с нижнюю грань
// плюс светлая дуга по нижнему краю — иначе выемка читается как пятно.
function drawRecess(ctx, x, baseY, size) {
  const top = shade(WOOD, BASE_TONE);
  ctx.fillStyle = shade(top, RECESS_DARK);
  ctx.beginPath();
  ctx.ellipse(x, baseY, size, size / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(top, RECESS_EDGE_LIGHT);
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.beginPath();
  ctx.ellipse(x, baseY, size * 0.94, size * 0.47, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}
