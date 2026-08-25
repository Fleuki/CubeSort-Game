// Макет города на столе. Растёт между уровнями, геймплей не трогает —
// это чистая награда.

import { PALETTE, WOOD, SHADOW, TABLE, shade } from './iso.js';

const DISTRICT_SIZE = 10;
const DISTRICT_KINDS = [
  ['house', 'house', 'house', 'park'],
  ['house', 'tower', 'tower', 'lamp'],
  ['tower', 'tower', 'bridge', 'park'],
  ['tower', 'house', 'park', 'lamp']
];

// Площадка: на пустом городе занимает 60% ширины зоны и растёт
// с застройкой, но не бесконечно.
const PLATE_BASE_SHARE = 0.6;
const PLATE_GROWTH = 0.05;
const PLATE_GROWTH_LIMIT = 14;
const PLATE_ASPECT = 0.46;
const PLATE_MAX_SHARE = 0.94;
const PLATE_CENTER_Y = 0.62;
const TILE_OF_PLATE = 0.8;
const MIN_RINGS = 2;
const JITTER = 0.06;
const BUILD_SCALE = 0.5;

export function createCity(buildings = []) {
  return { buildings: buildings.slice(), pending: null, dirty: true, canvas: null, ctx: null };
}

// Постройка готовится отдельно от макета: пока играет анимация выезда,
// её нельзя запекать в offscreen, иначе дом появится дважды. Но в раскладке
// она уже учитывается, иначе соседи прыгнут в момент фиксации.
export function prepareBuilding(city, colorIndex, level) {
  const district = Math.floor((level - 1) / DISTRICT_SIZE) % DISTRICT_KINDS.length;
  const pool = DISTRICT_KINDS[district];
  const index = city.buildings.length;
  const building = { index, color: colorIndex, kind: pool[index % pool.length], seed: (index * 2654435761) >>> 0 };
  city.pending = building;
  city.dirty = true;
  return building;
}

export function commitBuilding(city, building) {
  city.buildings.push(building);
  city.pending = null;
  city.dirty = true;
}

export function trimCity(city, count) {
  if (city.buildings.length <= count) return;
  city.buildings.length = count;
  city.dirty = true;
}

export function resetCity(city) {
  city.buildings.length = 0;
  city.pending = null;
  city.dirty = true;
}

function layoutCount(city) {
  return city.buildings.length + (city.pending ? 1 : 0);
}

function plate(rect, count) {
  const grown = 1 + PLATE_GROWTH * Math.min(count, PLATE_GROWTH_LIMIT);
  // Площадка не должна упираться в края экрана — иначе овал срезается.
  const rx = Math.min(rect.width * PLATE_BASE_SHARE * grown, rect.width * PLATE_MAX_SHARE) / 2;
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height * PLATE_CENTER_Y,
    rx,
    ry: rx * PLATE_ASPECT
  };
}

// Квадратная спираль от центра: город растёт пятном, а не рядами.
function spiralCell(index) {
  if (index === 0) return { gx: 0, gy: 0 };
  let ring = 1;
  let start = 1;
  while (start + 8 * ring <= index) {
    start += 8 * ring;
    ring += 1;
  }
  const offset = index - start;
  const side = Math.floor(offset / (2 * ring));
  const step = offset % (2 * ring);
  if (side === 0) return { gx: ring, gy: -ring + step };
  if (side === 1) return { gx: ring - step, gy: ring };
  if (side === 2) return { gx: -ring, gy: ring - step };
  return { gx: -ring + step, gy: -ring };
}

function ringsFor(count) {
  return Math.max(MIN_RINGS, Math.ceil((Math.sqrt(Math.max(1, count)) - 1) / 2));
}

// Детерминированный разброс: город не решётка и не случайная куча.
function jitterOf(seed) {
  const a = ((seed >>> 3) % 1000) / 1000 - 0.5;
  const b = ((seed >>> 13) % 1000) / 1000 - 0.5;
  return { jx: a * 2 * JITTER, jy: b * 2 * JITTER };
}

function buildingPoint(rect, count, building) {
  const disc = plate(rect, count);
  const tileW = (disc.rx * TILE_OF_PLATE) / (ringsFor(count) + 0.5);
  const tileH = tileW * PLATE_ASPECT;
  const cell = spiralCell(building.index);
  const shift = jitterOf(building.seed);
  return {
    x: disc.x + (cell.gx - cell.gy) * (tileW / 2) + shift.jx * tileW,
    y: disc.y + (cell.gx + cell.gy) * (tileH / 2) + shift.jy * tileH,
    scale: tileW * BUILD_SCALE
  };
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
    const local = { x: 0, y: 0, width: w, height: h };
    city.ctx.clearRect(0, 0, w, h);
    drawPlot(city.ctx, local, city);
    const count = layoutCount(city);
    const placed = city.buildings.map((building) => ({
      building,
      point: buildingPoint(local, count, building)
    }));
    // Ближние к зрителю рисуются позже.
    placed.sort((a, b) => a.point.y - b.point.y);
    for (let i = 0; i < placed.length; i += 1) {
      paintBuilding(city.ctx, placed[i].building, placed[i].point, 1);
    }
    city.dirty = false;
  }
  return city.canvas;
}

// Постройка в момент появления: рисуется поверх запечённого макета.
export function drawBuilding(ctx, rect, city, building, appear) {
  const point = buildingPoint(rect, layoutCount(city), building);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  paintBuilding(ctx, building, point, appear);
  ctx.restore();
}

// --- участок --------------------------------------------------------------

// До первой постройки участок уже обжитой: дорога, ограда, деревья, колодец.
// Пустой овал читался бы как ошибка загрузки, а не как награда.
function drawPlot(ctx, rect, city) {
  const disc = plate(rect, layoutCount(city));
  ctx.fillStyle = 'rgba(154, 123, 82, 0.12)';
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y + disc.ry * 0.06, disc.rx * 1.02, disc.ry * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(TABLE, 0.34);
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y, disc.rx, disc.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  drawRoad(ctx, disc);
  drawFence(ctx, disc);

  const props = [
    { kind: 'tree', point: propPoint(disc, -0.66, 0.3, 0.34) },
    { kind: 'tree', point: propPoint(disc, 0.7, -0.06, 0.3) },
    { kind: 'well', point: propPoint(disc, -0.2, 0.62, 0.32) }
  ];
  props.sort((a, b) => a.point.y - b.point.y);
  for (let i = 0; i < props.length; i += 1) {
    if (props[i].kind === 'tree') tree(ctx, props[i].point.x, props[i].point.y, props[i].point.scale, i);
    else well(ctx, props[i].point.x, props[i].point.y, props[i].point.scale);
  }
}

function propPoint(disc, ux, uy, scale) {
  return { x: disc.x + disc.rx * ux, y: disc.y + disc.ry * uy, scale: disc.rx * scale };
}

function drawRoad(ctx, disc) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y, disc.rx, disc.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(154, 123, 82, 0.22)';
  ctx.beginPath();
  ctx.moveTo(disc.x - disc.rx, disc.y + disc.ry * 0.22);
  ctx.lineTo(disc.x + disc.rx, disc.y - disc.ry * 0.52);
  ctx.lineTo(disc.x + disc.rx, disc.y - disc.ry * 0.12);
  ctx.lineTo(disc.x - disc.rx, disc.y + disc.ry * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFence(ctx, disc) {
  const posts = 9;
  ctx.strokeStyle = shade(WOOD, -0.08);
  ctx.lineWidth = Math.max(1.2, disc.rx * 0.012);
  const points = [];
  for (let i = 0; i < posts; i += 1) {
    const angle = Math.PI * (1.12 + (i / (posts - 1)) * 0.76);
    points.push({ x: disc.x + Math.cos(angle) * disc.rx * 0.92, y: disc.y + Math.sin(angle) * disc.ry * 0.92 });
  }
  const height = disc.ry * 0.24;
  for (let rail = 0; rail < 2; rail += 1) {
    ctx.beginPath();
    const lift = height * (rail === 0 ? 0.75 : 0.35);
    for (let i = 0; i < points.length; i += 1) {
      const px = points[i].x;
      const py = points[i].y - lift;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  for (let i = 0; i < points.length; i += 1) {
    ctx.beginPath();
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i].x, points[i].y - height);
    ctx.stroke();
  }
}

function well(ctx, x, y, scale) {
  groundShadow(ctx, x, y, scale * 0.42);
  ctx.fillStyle = shade(WOOD, -0.35);
  ctx.beginPath();
  ctx.ellipse(x, y - scale * 0.1, scale * 0.34, scale * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(WOOD, 0.05);
  ctx.beginPath();
  ctx.ellipse(x, y - scale * 0.2, scale * 0.34, scale * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, -0.3);
  ctx.lineWidth = Math.max(1.2, scale * 0.08);
  ctx.beginPath();
  ctx.moveTo(x - scale * 0.26, y - scale * 0.24);
  ctx.lineTo(x - scale * 0.26, y - scale * 0.62);
  ctx.moveTo(x + scale * 0.26, y - scale * 0.24);
  ctx.lineTo(x + scale * 0.26, y - scale * 0.62);
  ctx.stroke();
  ctx.fillStyle = shade(WOOD, -0.18);
  ctx.beginPath();
  ctx.moveTo(x - scale * 0.42, y - scale * 0.6);
  ctx.lineTo(x, y - scale * 0.86);
  ctx.lineTo(x + scale * 0.42, y - scale * 0.6);
  ctx.closePath();
  ctx.fill();
}

// --- постройки ------------------------------------------------------------

function paintBuilding(ctx, building, point, appear) {
  const scale = point.scale;
  const rise = (1 - appear) * scale * 2.2;
  const x = point.x;
  const y = point.y + rise;
  const color = PALETTE[building.color % PALETTE.length];
  switch (building.kind) {
    case 'tower':
      prism(ctx, x, y, scale * 0.52, scale * 1.75, color);
      windows(ctx, x, y, scale * 0.52, scale * 1.75, color, 3);
      break;
    case 'park':
      tree(ctx, x, y, scale * 0.68, building.color);
      break;
    case 'lamp':
      lamp(ctx, x, y, scale * 0.8);
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

function tree(ctx, x, y, scale, variant) {
  groundShadow(ctx, x, y, scale * 0.5);
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - scale * 0.07, y - scale * 0.55, scale * 0.14, scale * 0.55);
  const crown = variant % 2 === 0 ? '#5B9750' : '#4C8547';
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
