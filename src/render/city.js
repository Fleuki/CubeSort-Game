// Макет города на столе. Растёт между уровнями, геймплей не трогает —
// это чистая награда.

import { PALETTE, WOOD, SHADOW, shade } from './iso.js';

const GRID_COLS = 7;
const GRID_ROWS = 6;
const DISTRICT_SIZE = 10;
const KINDS = ['house', 'house', 'tower', 'park', 'lamp'];
const DISTRICT_KINDS = [
  ['house', 'house', 'house', 'park'],
  ['house', 'tower', 'tower', 'lamp'],
  ['tower', 'tower', 'bridge', 'park'],
  ['tower', 'house', 'park', 'lamp']
];

export function createCity(buildings = []) {
  return { buildings: buildings.slice(), dirty: true, canvas: null, ctx: null };
}

// Порядок застройки: от центра макета наружу, с детерминированным
// разбросом — город растёт пятном, а не рядами.
const SLOT_ORDER = buildSlotOrder();

function buildSlotOrder() {
  const total = GRID_COLS * GRID_ROWS;
  const slots = [];
  for (let slot = 0; slot < total; slot += 1) {
    const col = slot % GRID_COLS;
    const row = Math.floor(slot / GRID_COLS);
    const dx = col - (GRID_COLS - 1) / 2;
    const dy = row - (GRID_ROWS - 1) / 2;
    const jitter = ((slot * 2654435761) % 1000) / 1000;
    slots.push({ slot, weight: Math.sqrt(dx * dx + dy * dy) + jitter * 0.9 });
  }
  slots.sort((a, b) => a.weight - b.weight);
  return slots.map((item) => item.slot);
}

export function nextSlot(index) {
  return SLOT_ORDER[index % SLOT_ORDER.length];
}

// Постройка готовится отдельно от макета: пока играет анимация выезда,
// её нельзя запекать в offscreen, иначе дом появится дважды.
export function prepareBuilding(city, colorIndex, level) {
  const district = Math.floor((level - 1) / DISTRICT_SIZE) % DISTRICT_KINDS.length;
  const pool = DISTRICT_KINDS[district];
  const index = city.buildings.length;
  const kind = pool[index % pool.length] || KINDS[index % KINDS.length];
  return { slot: nextSlot(index), color: colorIndex, kind, seed: (index * 2654435761) >>> 0 };
}

export function commitBuilding(city, building) {
  city.buildings.push(building);
  city.dirty = true;
}

export function trimCity(city, count) {
  if (city.buildings.length <= count) return;
  city.buildings.length = count;
  city.dirty = true;
}

export function resetCity(city) {
  city.buildings.length = 0;
  city.dirty = true;
}

function slotPoint(rect, slot) {
  const col = slot % GRID_COLS;
  const row = Math.floor(slot / GRID_COLS);
  const tileW = (rect.width * 0.92) / (GRID_COLS + GRID_ROWS) * 2;
  const tileH = tileW / 2;
  // Начало координат сдвинуто так, чтобы центр сетки лёг на центр плиты.
  const originX = rect.x + rect.width / 2 - ((GRID_COLS - 1) - (GRID_ROWS - 1)) * (tileW / 4);
  const originY = rect.y + rect.height * 0.60 - ((GRID_COLS - 1) + (GRID_ROWS - 1)) * (tileH / 4);
  return {
    x: originX + (col - row) * (tileW / 2),
    y: originY + (col + row) * (tileH / 2),
    scale: tileW / 2
  };
}

function depth(building) {
  const col = building.slot % GRID_COLS;
  const row = Math.floor(building.slot / GRID_COLS);
  return col + row;
}

// Отдельный offscreen: макет перерисовывается при изменении, а не каждый кадр.
export function getCityCanvas(city, rect) {
  if (!city.canvas) {
    city.canvas = document.createElement('canvas');
    city.ctx = city.canvas.getContext('2d');
    city.dirty = true;
  }
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (city.canvas.width !== w || city.canvas.height !== h) {
    city.canvas.width = w;
    city.canvas.height = h;
    city.dirty = true;
  }
  if (city.dirty) {
    city.ctx.clearRect(0, 0, w, h);
    const local = { x: 0, y: 0, width: w, height: h };
    const sorted = city.buildings.slice().sort((a, b) => depth(a) - depth(b));
    for (let i = 0; i < sorted.length; i += 1) {
      drawBuilding(city.ctx, local, sorted[i], 1);
    }
    city.dirty = false;
  }
  return city.canvas;
}

export function drawBuilding(ctx, rect, building, appear = 1) {
  const point = slotPoint(rect, building.slot);
  const scale = point.scale;
  const rise = (1 - appear) * scale * 2.2;
  const x = point.x;
  const y = point.y + rise;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  const color = PALETTE[building.color % PALETTE.length];
  switch (building.kind) {
    case 'tower':
      prism(ctx, x, y, scale * 0.52, scale * 1.75, color);
      windows(ctx, x, y, scale * 0.52, scale * 1.75, color, 3);
      break;
    case 'park':
      tree(ctx, x, y, scale * 0.9, color);
      break;
    case 'lamp':
      lamp(ctx, x, y, scale * 0.9);
      break;
    case 'bridge':
      bridge(ctx, x, y, scale, color);
      break;
    default: {
      // Высота домика чуть пляшет от постройки к постройке — иначе квартал
      // выглядит штампованным.
      const height = scale * (0.62 + (building.seed % 3) * 0.13);
      prism(ctx, x, y, scale * 0.62, height, color);
      gableRoof(ctx, x, y - height, scale * 0.62, color);
      break;
    }
  }
  ctx.restore();
}

function groundShadow(ctx, x, y, w) {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.35, y + w * 0.16, w * 1.15, w * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Изометрическая коробка: (x, y) — центр нижней грани на столе.
function prism(ctx, x, y, w, h, color) {
  const half = w / 2;
  groundShadow(ctx, x, y, w * 0.9);
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(x - w, y - half);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - w, y - h - half);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.14);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w, y - half);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w, y - h - half);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.34);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y - h - half);
  ctx.lineTo(x, y - h - w);
  ctx.lineTo(x - w, y - h - half);
  ctx.closePath();
  ctx.fillStyle = shade(color, 0.18);
  ctx.fill();
  ctx.stroke();
}

// Двускатная крыша: конёк идёт вдоль левой грани, к зрителю смотрят
// скат и фронтон. Без неё коробка читается как обычный кубик.
function gableRoof(ctx, x, y, w, color) {
  const half = w / 2;
  const rise = w * 0.6;
  const west = { x: x - w, y: y - half };
  const north = { x, y: y - w };
  const east = { x: x + w, y: y - half };
  const south = { x, y };
  const ridgeBack = { x: x - w / 2, y: y - w * 0.75 - rise };
  const ridgeFront = { x: x + w / 2, y: y - w * 0.25 - rise };

  ctx.strokeStyle = shade(color, -0.55);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';

  quad(ctx, north, east, ridgeFront, ridgeBack, shade(color, -0.52));
  quad(ctx, west, south, ridgeFront, ridgeBack, shade(color, -0.3));
  ctx.beginPath();
  ctx.moveTo(south.x, south.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(ridgeFront.x, ridgeFront.y);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.44);
  ctx.fill();
  ctx.stroke();
}

function quad(ctx, a, b, c, d, fill) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

function windows(ctx, x, y, w, h, color, rows) {
  ctx.fillStyle = shade(color, 0.42);
  for (let i = 0; i < rows; i += 1) {
    const wy = y - h * (0.25 + i * 0.26);
    ctx.beginPath();
    ctx.ellipse(x - w * 0.45, wy - w * 0.2, w * 0.16, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.45, wy - w * 0.2, w * 0.16, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tree(ctx, x, y, scale, color) {
  groundShadow(ctx, x, y, scale * 0.5);
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - scale * 0.07, y - scale * 0.55, scale * 0.14, scale * 0.55);
  const crown = color % 2 === 0 ? '#5B9750' : '#4C8547';
  ctx.fillStyle = shade(crown, -0.08);
  ctx.beginPath();
  ctx.ellipse(x, y - scale * 0.74, scale * 0.34, scale * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(crown, 0.14);
  ctx.beginPath();
  ctx.ellipse(x - scale * 0.09, y - scale * 0.86, scale * 0.2, scale * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function lamp(ctx, x, y, scale) {
  groundShadow(ctx, x, y, scale * 0.32);
  ctx.strokeStyle = shade(WOOD, -0.3);
  ctx.lineWidth = Math.max(1.4, scale * 0.09);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - scale * 0.85);
  ctx.stroke();
  ctx.fillStyle = '#E2A238';
  ctx.beginPath();
  ctx.arc(x, y - scale * 0.95, scale * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function bridge(ctx, x, y, scale, color) {
  groundShadow(ctx, x, y, scale * 0.9);
  ctx.strokeStyle = shade(color, -0.1);
  ctx.lineWidth = scale * 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - scale * 0.9, y);
  ctx.quadraticCurveTo(x, y - scale * 0.95, x + scale * 0.9, y);
  ctx.stroke();
  ctx.lineWidth = scale * 0.07;
  ctx.strokeStyle = shade(color, -0.4);
  for (let i = -2; i <= 2; i += 1) {
    const t = i / 2.4;
    const px = x + t * scale * 0.9;
    const py = y - (1 - t * t) * scale * 0.62;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + scale * 0.3);
    ctx.stroke();
  }
}
