// Изометрия 2:1 и отрисовка деревянных деталей. Модуль только рисует,
// состояние не трогает.

export const PALETTE = ['#D4553F', '#E2A238', '#5B9750', '#3B71A4', '#7A57A3', '#3E9E93', '#C9628C'];
export const SKY_TOP = '#F2EADA';
export const TABLE = '#DFD0B4';
export const WOOD = '#9A7B52';
export const WOOD_DARK = '#7E6242';
export const SHADOW = 'rgba(92, 70, 44, 0.20)';
export const INK = '#2E2A24';

const TOP_LIGHT = 0.18;
const LEFT_DARK = 0.14;
const RIGHT_DARK = 0.34;
const STROKE_DARK = 0.5;
const STROKE_WIDTH = 1.5;
const SIDE_RATIO = 0.82;
const SYMBOL_SCALE = 0.42;

// Символ на верхней грани: доступность для дальтоников и заодно деталь,
// от которой кубик выглядит сделанным, а не залитым.
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

  drawSymbol(ctx, x, y, size, colorIndex, base);
}

function drawSymbol(ctx, x, y, size, colorIndex, base) {
  const r = size * SYMBOL_SCALE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  ctx.strokeStyle = shade(base, -STROKE_DARK);
  ctx.lineWidth = Math.max(1.2, size * 0.09);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (SYMBOLS[colorIndex % SYMBOLS.length]) {
    case 'circle':
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(-r * 0.5, -r * 0.5, r, r);
      break;
    case 'triangle':
      ctx.moveTo(0, -r * 0.62);
      ctx.lineTo(r * 0.6, r * 0.48);
      ctx.lineTo(-r * 0.6, r * 0.48);
      ctx.closePath();
      break;
    case 'cross':
      ctx.moveTo(-r * 0.55, -r * 0.55);
      ctx.lineTo(r * 0.55, r * 0.55);
      ctx.moveTo(r * 0.55, -r * 0.55);
      ctx.lineTo(-r * 0.55, r * 0.55);
      break;
    case 'star':
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = Math.cos(angle) * r * 0.7;
        const py = Math.sin(angle) * r * 0.7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        const inner = angle + Math.PI / 5;
        ctx.lineTo(Math.cos(inner) * r * 0.3, Math.sin(inner) * r * 0.3);
      }
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(0, -r * 0.7);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(-r * 0.55, 0);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
      ctx.moveTo(r * 0.3, 0);
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

export function drawShadowEllipse(ctx, x, y, rx, ry, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Штырь на круглой подставке. Тень падает вправо-вниз под 30°.
export function drawPost(ctx, x, baseY, pegHeight, size) {
  const baseRx = size * 1.15;
  const baseRy = baseRx / 2;
  const pegW = size * 0.22;

  drawShadowEllipse(ctx, x + baseRy * 0.9, baseY + baseRy * 0.5, baseRx * 1.05, baseRy * 0.95);

  ctx.fillStyle = shade(WOOD, -0.22);
  ctx.beginPath();
  ctx.roundRect(x - pegW / 2, baseY - pegHeight, pegW, pegHeight, pegW / 2);
  ctx.fill();
  ctx.fillStyle = shade(WOOD, 0.06);
  ctx.beginPath();
  ctx.roundRect(x - pegW / 2, baseY - pegHeight, pegW * 0.45, pegHeight, pegW / 4);
  ctx.fill();

  ctx.fillStyle = WOOD_DARK;
  ctx.beginPath();
  ctx.ellipse(x, baseY + baseRy * 0.16, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WOOD;
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx, baseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, -0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseRx * 0.72, baseRy * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}
