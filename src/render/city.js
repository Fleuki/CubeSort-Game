// Макет города на столе. Растёт между уровнями, геймплей не трогает —
// это чистая награда. Все размеры — в единицах масштаба из scale.js.

import { PALETTE, WOOD, TABLE, shade } from './iso.js';
import { drawShadow, drawShadowAlong } from './shadow.js';
import { heightUnits, widthUnits } from './scale.js';

// Площадка: на пустом городе занимает 60% ширины зоны и растёт
// с застройкой, но не бесконечно.
const PLATE_BASE_SHARE = 0.6;
const PLATE_GROWTH = 0.05;
const PLATE_GROWTH_LIMIT = 14;
const PLATE_MAX_SHARE = 0.94;
const PLATE_ASPECT = 0.46;
const PLATE_CENTER_Y = 0.62;
// Застройка живёт во внутренней части площадки: по краю идут деревья
// и ограда, и налезать на них дома не должны.
const INNER_SHARE = 0.72;
const MIN_RINGS = 2;
const MAX_RINGS = 4;
const UNIT_OF_TILE = 0.45;
// Самая высокая постройка плюс вынос дальнего кольца должны помещаться
// над центром площадки, иначе башни лезут в HUD.
const TALLEST_UNITS = 3.4;
const JITTER = 0.06;

// Ступени застройки: тип новой постройки зависит от того, сколько их уже.
const HOUSE1_UNTIL = 8;
const HOUSE2_UNTIL = 20;
const LANDMARK_AT = [45, 60];
const ROAD_FROM = 10;
const LAMPS_FROM = 16;
const BRIDGE_FROM = 26;
const DISTRICT_SIZE = 10;
// Потолок плотности: дальше город растёт вверх, а не расползается.
const MAX_BUILDINGS = 61;

const WINDOW_LIT = '#FFD98A';
const GLOW_ALPHA = 0.12;
const STREAM = '#3E9E93';

export function createCity(buildings = []) {
  return { buildings: buildings.slice(), pending: null, dirty: true, canvas: null, ctx: null };
}

// Что появится за очередной собранный столбик: новая постройка или,
// если площадка заполнена, этаж случайному существующему зданию.
export function prepareBuilding(city, colorIndex, level) {
  city.dirty = true;
  if (city.buildings.length >= MAX_BUILDINGS) {
    const target = pickUpgrade(city, level);
    city.pending = { building: target, upgrade: true, floors: target.floors + 1 };
    return city.pending;
  }
  const order = city.buildings.length;
  const building = {
    index: order,
    color: colorIndex,
    kind: kindFor(order),
    floors: 1,
    district: Math.floor(order / DISTRICT_SIZE),
    lit: false,
    seed: (order * 2654435761) >>> 0
  };
  city.pending = { building, upgrade: false };
  return city.pending;
}

export function commitBuilding(city, pending) {
  if (!pending) return;
  if (pending.upgrade) pending.building.floors = pending.floors;
  else city.buildings.push(pending.building);
  city.pending = null;
  city.dirty = true;
}

export function resetCity(city) {
  city.buildings.length = 0;
  city.pending = null;
  city.dirty = true;
}

// Снимок для отмены хода: меняться могут число построек, этажность и свет.
export function snapshotCity(city) {
  return {
    count: city.buildings.length,
    floors: city.buildings.map((building) => building.floors),
    lit: city.buildings.map((building) => building.lit)
  };
}

export function restoreCity(city, snapshot) {
  if (!snapshot) return;
  if (city.buildings.length > snapshot.count) city.buildings.length = snapshot.count;
  for (let i = 0; i < city.buildings.length; i += 1) {
    city.buildings[i].floors = snapshot.floors[i];
    city.buildings[i].lit = snapshot.lit[i];
  }
  city.pending = null;
  city.dirty = true;
}

// Район считается завершённым каждые DISTRICT_SIZE построек.
export function completedDistrict(city) {
  const count = city.buildings.length;
  if (count === 0 || count % DISTRICT_SIZE !== 0) return -1;
  return count / DISTRICT_SIZE - 1;
}

// Порядок зажигания окон: волной слева направо.
export function lightingOrder(city, rect, district) {
  const count = layoutCount(city);
  return city.buildings
    .filter((building) => building.district === district && !building.lit)
    .map((building) => ({ building, x: buildingPoint(rect, count, building).x }))
    .sort((a, b) => a.x - b.x)
    .map((item) => item.building);
}

export function lightBuilding(city, building) {
  building.lit = true;
  city.dirty = true;
}

function kindFor(order) {
  const number = order + 1;
  if (LANDMARK_AT.indexOf(number) >= 0) return 'landmark';
  if (number <= HOUSE1_UNTIL) return 'house1';
  if (number <= HOUSE2_UNTIL) return 'house2';
  return 'tower';
}

function pickUpgrade(city, level) {
  // Детерминированно «случайное» здание: от уровня, а не от Math.random,
  // иначе после отмены хода этаж уедет другому дому.
  const index = ((level * 2654435761) >>> 0) % city.buildings.length;
  return city.buildings[index];
}

function layoutCount(city) {
  return city.buildings.length + (city.pending && !city.pending.upgrade ? 1 : 0);
}

function plate(rect, count) {
  const grown = 1 + PLATE_GROWTH * Math.min(count, PLATE_GROWTH_LIMIT);
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
  const needed = Math.ceil((Math.sqrt(Math.max(1, count)) - 1) / 2);
  return Math.max(MIN_RINGS, Math.min(MAX_RINGS, needed));
}

// Шаг сетки подбирается так, чтобы дальнее кольцо ровно вписалось
// во внутреннюю часть площадки — тогда клампы не нужны и дома
// не налезают на деревья и ограду.
function grid(rect, count) {
  const disc = plate(rect, count);
  const rings = ringsFor(count);
  const tileW = (disc.rx * INNER_SHARE) / rings;
  const tileH = tileW * PLATE_ASPECT;
  const headroom = Math.max(1, disc.y - rect.y - rings * tileH);
  const unit = Math.min(tileW * UNIT_OF_TILE, headroom / TALLEST_UNITS);
  return { disc, tileW, tileH, unit };
}

function jitterOf(seed) {
  const a = ((seed >>> 3) % 1000) / 1000 - 0.5;
  const b = ((seed >>> 13) % 1000) / 1000 - 0.5;
  return { jx: a * 2 * JITTER, jy: b * 2 * JITTER };
}

function buildingPoint(rect, count, building) {
  const g = grid(rect, count);
  const cell = spiralCell(building.index);
  const shift = jitterOf(building.seed);
  return {
    x: g.disc.x + (cell.gx - cell.gy) * (g.tileW / 2) + shift.jx * g.tileW,
    y: g.disc.y + (cell.gx + cell.gy) * (g.tileH / 2) + shift.jy * g.tileH,
    unit: g.unit
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
    drawGround(city.ctx, local, city);
    const items = sceneItems(local, city);
    for (let i = 0; i < items.length; i += 1) paintItem(city.ctx, items[i], 1);
    city.dirty = false;
  }
  return city.canvas;
}

// Постройка в момент появления: рисуется поверх запечённого макета.
export function drawBuilding(ctx, rect, city, pending, appear) {
  if (!pending) return;
  const point = buildingPoint(rect, layoutCount(city), pending.building);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  paintItem(ctx, {
    kind: pending.building.kind,
    building: pending.building,
    floors: pending.upgrade ? pending.floors : pending.building.floors,
    point,
    groundY: point.y
  }, appear);
  ctx.restore();
}

// Все объекты макета в одном списке и с явной точкой касания земли:
// глубина считается по основанию, иначе высокий дом «перекрывает»
// дерево, которое стоит ближе к зрителю.
function sceneItems(rect, city) {
  const count = layoutCount(city);
  const g = grid(rect, count);
  const items = [];
  const props = [
    { kind: 'treeLarge', ux: -0.74, uy: 0.24 },
    { kind: 'treeSmall', ux: 0.78, uy: -0.04 },
    { kind: 'bush', ux: -0.36, uy: 0.66 },
    { kind: 'bush', ux: 0.5, uy: 0.62 }
  ];
  if (city.buildings.length >= LAMPS_FROM) {
    props.push({ kind: 'lamp', ux: -0.6, uy: 0.5 });
    props.push({ kind: 'lamp', ux: 0.64, uy: 0.44 });
  }
  if (city.buildings.length >= BRIDGE_FROM) {
    props.push({ kind: 'bridge', ux: 0.02, uy: 0.72 });
  }
  for (let i = 0; i < props.length; i += 1) {
    const prop = props[i];
    const point = { x: g.disc.x + g.disc.rx * prop.ux, y: g.disc.y + g.disc.ry * prop.uy, unit: g.unit };
    items.push({ kind: prop.kind, point, groundY: point.y, variant: i });
  }
  for (let i = 0; i < city.buildings.length; i += 1) {
    const building = city.buildings[i];
    if (city.pending && city.pending.upgrade && city.pending.building === building) continue;
    const point = buildingPoint(rect, count, building);
    items.push({ kind: building.kind, building, floors: building.floors, point, groundY: point.y });
  }
  items.sort((a, b) => a.groundY - b.groundY);
  return items;
}

function paintItem(ctx, item, appear) {
  const unit = item.point.unit;
  const kind = item.kind;
  const height = heightUnits(kind, item.floors || 1) * unit;
  const width = widthUnits(kind) * unit;
  const rise = (1 - appear) * (height + unit * 0.6);
  const x = item.point.x;
  const y = item.point.y + rise;
  if (item.building) {
    paintBuilding(ctx, item.building, x, y, width, height, unit, appear);
    return;
  }
  if (kind === 'lamp') lamp(ctx, x, y, width, height);
  else if (kind === 'bridge') bridge(ctx, x, y, width, height);
  else if (kind === 'bush') bush(ctx, x, y, width, height, item.variant);
  else tree(ctx, x, y, width, height, item.variant);
}

// --- участок --------------------------------------------------------------

// До первой постройки участок уже обжитой: ограда, деревья, кусты.
// Пустой овал читался бы как ошибка загрузки, а не как награда.
function drawGround(ctx, rect, city) {
  const g = grid(rect, layoutCount(city));
  const disc = g.disc;
  ctx.fillStyle = 'rgba(154, 123, 82, 0.12)';
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y + disc.ry * 0.06, disc.rx * 1.02, disc.ry * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(TABLE, 0.34);
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y, disc.rx, disc.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  if (city.buildings.length >= ROAD_FROM) drawRoad(ctx, disc);
  if (city.buildings.length >= BRIDGE_FROM) drawStream(ctx, disc, g.unit);
  drawFence(ctx, disc, g.unit);
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

// Ручей: узкая приглушённая лента у переднего края, мост её переходит.
function drawStream(ctx, disc, unit) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(disc.x, disc.y, disc.rx, disc.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  // Вода приглушена прозрачностью: яркая бирюза на песке читается
  // как лужа краски, а не как ручей.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = shade(STREAM, 0.3);
  ctx.lineWidth = Math.max(2, unit * 0.4);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(disc.x - disc.rx * 0.86, disc.y + disc.ry * 0.94);
  ctx.quadraticCurveTo(disc.x, disc.y + disc.ry * 0.62, disc.x + disc.rx * 0.86, disc.y + disc.ry * 0.9);
  ctx.stroke();
  ctx.restore();
}

function drawFence(ctx, disc, unit) {
  const posts = 9;
  const points = [];
  for (let i = 0; i < posts; i += 1) {
    const angle = Math.PI * (1.12 + (i / (posts - 1)) * 0.76);
    points.push({ x: disc.x + Math.cos(angle) * disc.rx * 0.92, y: disc.y + Math.sin(angle) * disc.ry * 0.92 });
  }
  const height = unit * 0.5;
  // Одна вытянутая тень на всю дугу, а не пятно под каждой секцией.
  drawShadowAlong(ctx, points, height, unit * 0.2);
  ctx.strokeStyle = shade(WOOD, -0.08);
  ctx.lineWidth = Math.max(1.2, unit * 0.05);
  for (let rail = 0; rail < 2; rail += 1) {
    ctx.beginPath();
    const lift = height * (rail === 0 ? 0.78 : 0.38);
    for (let i = 0; i < points.length; i += 1) {
      const px = points[i].x;
      const py = points[i].y - lift;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  for (let i = 0; i < points.length; i += 1) {
    // Столбики стоят на земле: нижний конец — ровно точка касания.
    const edge = i === 0 || i === points.length - 1;
    ctx.lineWidth = Math.max(1.2, unit * (edge ? 0.08 : 0.05));
    ctx.beginPath();
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i].x, points[i].y - height * (edge ? 1.25 : 1));
    ctx.stroke();
  }
}

// --- постройки ------------------------------------------------------------

// Высота из таблицы масштабов — это высота ВСЕЙ постройки вместе с крышей,
// поэтому корпусу достаётся только часть, иначе домик вытягивается в башню.
const BODY_SHARE = { house1: 0.62, house2: 0.7, landmark: 0.74, tower: 0.94 };

function paintBuilding(ctx, building, x, y, width, height, unit, appear) {
  const color = PALETTE[building.color % PALETTE.length];
  const half = width / 2;
  const body = height * (BODY_SHARE[building.kind] || 0.9);
  const roof = height - body;
  if (building.lit) glow(ctx, x, y - height * 0.45, width * 2.4, height);
  prism(ctx, x, y, half, body, color);
  if (building.kind === 'house1' || building.kind === 'house2') {
    gableRoof(ctx, x, y - body, half, color, roof);
  } else if (building.kind === 'landmark') {
    crown(ctx, x, y - body, half, color, building.seed, roof);
  } else {
    flatRoof(ctx, x, y - body, half, color);
  }
  if (building.kind !== 'house1') {
    windows(ctx, x, y, half, body, color, unit, building.lit);
  }
  void appear;
}

// Мягкое тёплое свечение вокруг зданий завершённого района.
function glow(ctx, x, y, rx, ry) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, rx);
  gradient.addColorStop(0, `rgba(255, 217, 138, ${GLOW_ALPHA})`);
  gradient.addColorStop(0.55, `rgba(255, 217, 138, ${GLOW_ALPHA * 0.5})`);
  gradient.addColorStop(1, 'rgba(255, 217, 138, 0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.35, ry / rx));
  ctx.translate(-x, -y);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Изометрическая коробка: (x, y) — центр опоры на столе.
function prism(ctx, x, y, w, h, color) {
  const half = w / 2;
  // Точка касания — центр опоры коробки, а не её передний угол.
  drawShadow(ctx, x, y - half, h, w * 2.1);
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
}

function flatRoof(ctx, x, y, w, color) {
  const half = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y - half);
  ctx.lineTo(x, y - w);
  ctx.lineTo(x - w, y - half);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.18);
  ctx.fill();
  ctx.stroke();
}

// Двускатная крыша: конёк идёт вдоль левой грани, к зрителю смотрят
// скат и фронтон. Без неё коробка читается как обычный кубик.
function gableRoof(ctx, x, y, w, color, roofHeight) {
  const half = w / 2;
  const rise = Math.max(w * 0.35, roofHeight - half * 0.6);
  const west = { x: x - w, y: y - half };
  const north = { x, y: y - w };
  const east = { x: x + w, y: y - half };
  const south = { x, y };
  const ridgeBack = { x: x - w / 2, y: y - w * 0.75 - rise };
  const ridgeFront = { x: x + w / 2, y: y - w * 0.25 - rise };

  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';

  quad(ctx, north, east, ridgeFront, ridgeBack, shade(color, -0.3));
  quad(ctx, west, south, ridgeFront, ridgeBack, shade(color, -0.18));
  ctx.beginPath();
  ctx.moveTo(south.x, south.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(ridgeFront.x, ridgeFront.y);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.26);
  ctx.fill();
  ctx.stroke();
}

// Доминанта: шпиль или купол. Ставится ровно дважды за весь город.
function crown(ctx, x, y, w, color, seed, roofHeight) {
  flatRoof(ctx, x, y, w, color);
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1;
  if (seed % 2 === 0) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - w * 0.5);
    ctx.lineTo(x, y - w * 0.5 - roofHeight);
    ctx.lineTo(x + w * 0.5, y - w * 0.5);
    ctx.closePath();
    ctx.fillStyle = shade(color, -0.24);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x, y - w * 0.5, w * 0.66, Math.max(w * 0.5, roofHeight), 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = shade(color, -0.24);
    ctx.fill();
    ctx.stroke();
  }
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

// Окна: ряд на этаж, у завершённого района они горят тёплым светом.
function windows(ctx, x, y, w, h, color, unit, lit) {
  const rows = Math.max(1, Math.round(h / (unit * 0.62)));
  const rw = w * 0.2;
  ctx.fillStyle = lit ? WINDOW_LIT : shade(color, 0.4);
  for (let i = 0; i < rows; i += 1) {
    const wy = y - h * ((i + 0.6) / rows);
    ctx.beginPath();
    ctx.ellipse(x - w * 0.48, wy - w * 0.24, rw, rw * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.48, wy - w * 0.24, rw, rw * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- озеленение -----------------------------------------------------------

function tree(ctx, x, y, width, height, variant) {
  drawShadow(ctx, x, y, height, width * 1.3);
  const trunk = width * 0.16;
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - trunk / 2, y - height * 0.5, trunk, height * 0.5);
  const crownColor = variant % 2 === 0 ? '#5B9750' : '#4C8547';
  ctx.fillStyle = shade(crownColor, -0.08);
  ctx.beginPath();
  ctx.ellipse(x, y - height * 0.68, width * 0.5, height * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(crownColor, 0.14);
  ctx.beginPath();
  ctx.ellipse(x - width * 0.14, y - height * 0.8, width * 0.28, height * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function bush(ctx, x, y, width, height, variant) {
  drawShadow(ctx, x, y, height, width * 1.2);
  const crownColor = variant % 2 === 0 ? '#4C8547' : '#5B9750';
  ctx.fillStyle = shade(crownColor, -0.06);
  ctx.beginPath();
  ctx.ellipse(x, y - height * 0.5, width * 0.5, height * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(crownColor, 0.12);
  ctx.beginPath();
  ctx.ellipse(x - width * 0.12, y - height * 0.66, width * 0.24, height * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function lamp(ctx, x, y, width, height) {
  drawShadow(ctx, x, y, height, width * 3);
  ctx.strokeStyle = shade(WOOD, -0.3);
  ctx.lineWidth = Math.max(1.2, width);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - height);
  ctx.stroke();
  ctx.fillStyle = '#E2A238';
  ctx.beginPath();
  ctx.arc(x, y - height - width * 0.6, Math.max(1.5, width * 1.1), 0, Math.PI * 2);
  ctx.fill();
}

function bridge(ctx, x, y, width, height) {
  drawShadow(ctx, x, y, height, width);
  const span = width / 2;
  ctx.strokeStyle = shade(WOOD, 0.04);
  ctx.lineWidth = height * 0.34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - span, y);
  ctx.quadraticCurveTo(x, y - height * 1.5, x + span, y);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, height * 0.12);
  ctx.strokeStyle = shade(WOOD, -0.3);
  for (let i = -2; i <= 2; i += 1) {
    const t = i / 2.4;
    const px = x + t * span;
    const py = y - (1 - t * t) * height;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + height * 0.5);
    ctx.stroke();
  }
}
