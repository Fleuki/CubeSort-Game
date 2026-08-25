// Макет города на столе. Растёт между уровнями, геймплей не трогает —
// это чистая награда. Собран из тех же кубиков, что и игровое поле:
// свой рендер деталей здесь не заводится, всё идёт через iso.js.

import { PALETTE, WOOD, TABLE, OUTLINE_DARK, OUTLINE_WIDTH, cubeSideHeight, drawBlock, drawStud, shade } from './iso.js';
import { drawShadow, drawShadowAlong } from './shadow.js';
import {
  CUBE_WIDTH_UNITS, GABLE_RISE, SLAB_HEIGHT, SLAB_OVERHANG, SPIRE_RISE,
  CROWN_HEIGHT, CROWN_LARGE, CROWN_WIDTH, TRUNK_HEIGHT, TRUNK_WIDTH,
  LAMP_HEAD_HEIGHT, LAMP_HEAD_WIDTH, LAMP_POST_HEIGHT, LAMP_POST_WIDTH, BUSH_SCALE,
  KIND_ROOF, MAX_CUBES, buildingCubes, buildingHeightUnits, cubeHalf, propHeightUnits,
  propWidthUnits, roofUnits
} from './scale.js';

// Версия схемы города. Не совпала с сохранением — город пересобирается
// с нуля по актуальным правилам, прогресс уровней при этом цел.
export const CITY_SCHEMA_VERSION = 3;

// Ступени застройки: тип новой постройки зависит от того, сколько их уже.
const HOUSE1_UNTIL = 8;
const HOUSE2_UNTIL = 20;
const BLOCK3_UNTIL = 40;
const LANDMARK_AT = [45, 60];
const ROAD_FROM = 10;
const DISTRICT_SIZE = 10;
// Потолок плотности: дальше город растёт вверх, а не расползается.
const MAX_BUILDINGS = 60;

// Камера отъезжает ступенями, по одной на завершённый район.
const ZOOM_STEP = 0.86;
const MAX_STAGE = 5;

// Раскладка по золотому углу равномерно заполняет круг без решётки.
const GOLDEN_ANGLE = (137.507 * Math.PI) / 180;
// Минимальное расстояние между соседями в такой спирали равно шагу,
// джиттер съедает ещё 3.2%. Шаг берём с запасом на ширину кубика,
// требуемый зазор в 0.25 и вынос кроны большого дерева.
const STEP_UNITS = 2.85;
const JITTER = 0.05;
// Каждый шестой участок отдан озеленению — деревья стоят между домами,
// а не жмутся к ограде.
const PROP_EVERY = 6;
// Запас от крайней постройки до ограды: половина кубика плюс поле.
const EDGE_UNITS = CUBE_WIDTH_UNITS / 2 + 0.5;

// Овал: центр ниже середины зоны, вертикальное сжатие — как у кубика.
// Сплющить его можно, но не до полоски.
const PLATE_CENTER_Y = 0.6;
const PLATE_ASPECT = 0.5;
const MIN_PLATE_ASPECT = 0.36;
const PLATE_MARGIN = 8;
const FENCE_RADIUS = 0.97;
// Стартовый масштаб: одноэтажный домик занимает эту долю высоты зоны,
// если такой город помещается в неё целиком.
const START_HOUSE_SHARE = 0.14;

const GLOW_ALPHA = 0.12;
const ROOF_DARK = -0.18;
// Пятно тени шире основания: под самим кубиком его не видно —
// низ детали накрывает пятно целиком.
const SHADOW_SPREAD = 1.6;
const CROWN_COLORS = ['#5B9750', '#4C8547'];
const LAMP_HEAD_COLOR = '#E2A238';

export function createCity(buildings = []) {
  const city = { buildings: buildings.slice(), pending: null, stage: 0, dirty: true, canvas: null, ctx: null };
  syncCamera(city);
  return city;
}

// Что появится за очередной собранный столбик: новая постройка или,
// если площадка заполнена, этаж случайному существующему зданию.
export function prepareBuilding(city, colorIndex, level) {
  city.dirty = true;
  if (city.buildings.length >= MAX_BUILDINGS) {
    const target = pickUpgrade(city, level);
    city.pending = target ? { building: target, upgrade: true, floors: target.floors + 1 } : null;
    return city.pending;
  }
  city.pending = { building: makeBuilding(city.buildings.length, colorIndex), upgrade: false };
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
  syncCamera(city);
  city.dirty = true;
}

// Сколько столбиков собрано всего: постройки плюс надстроенные этажи.
export function countColumns(buildings) {
  let total = 0;
  for (let i = 0; i < buildings.length; i += 1) total += Math.max(1, Number(buildings[i].floors) || 1);
  return total;
}

// Миграция: город собирается заново из числа собранных столбиков.
// Порядок построек, цвета и свет полностью определяются этим числом.
export function rebuildCity(city, columns) {
  const total = Math.max(0, Math.floor(columns) || 0);
  const count = Math.min(MAX_BUILDINGS, total);
  city.buildings.length = 0;
  city.pending = null;
  for (let i = 0; i < count; i += 1) city.buildings.push(makeBuilding(i, migratedColor(i)));
  for (let extra = 0; extra < total - count; extra += 1) {
    const target = pickUpgrade(city, extra);
    if (target) target.floors += 1;
  }
  const districts = Math.floor(count / DISTRICT_SIZE);
  for (let i = 0; i < count; i += 1) city.buildings[i].lit = city.buildings[i].district < districts;
  syncCamera(city);
  city.dirty = true;
}

// Снимок для отмены хода: меняться могут число построек, этажность,
// свет и ступень камеры.
export function snapshotCity(city) {
  return {
    count: city.buildings.length,
    stage: city.stage,
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
  city.stage = snapshot.stage;
  city.dirty = true;
}

// Район считается завершённым каждые DISTRICT_SIZE построек.
export function completedDistrict(city) {
  const count = city.buildings.length;
  if (count === 0 || count % DISTRICT_SIZE !== 0) return -1;
  return count / DISTRICT_SIZE - 1;
}

// Ступень камеры: одна на завершённый район, дальше масштаб фиксирован.
export function cameraTarget(city) {
  return Math.min(MAX_STAGE, Math.floor(city.buildings.length / DISTRICT_SIZE));
}

export function syncCamera(city) {
  city.stage = cameraTarget(city);
}

export function setCameraStage(city, stage) {
  city.stage = stage;
  city.dirty = true;
}

// Порядок зажигания окон: волной слева направо.
export function lightingOrder(city, rect, district) {
  const geo = geometry(rect, city);
  return city.buildings
    .filter((building) => building.district === district && !building.lit)
    .map((building) => ({ building, x: buildingPoint(geo, building).x }))
    .sort((a, b) => a.x - b.x)
    .map((item) => item.building);
}

export function lightBuilding(city, building) {
  building.lit = true;
  city.dirty = true;
}

function makeBuilding(order, colorIndex) {
  return {
    index: order,
    color: colorIndex % PALETTE.length,
    kind: kindFor(order),
    floors: 1,
    district: Math.floor(order / DISTRICT_SIZE),
    lit: false,
    seed: hash(order)
  };
}

function kindFor(order) {
  const number = order + 1;
  if (LANDMARK_AT.indexOf(number) >= 0) return 'landmark';
  if (number <= HOUSE1_UNTIL) return 'house1';
  if (number <= HOUSE2_UNTIL) return 'house2';
  if (number <= BLOCK3_UNTIL) return 'block3';
  return 'block4';
}

// Перемешивание битов, а не просто умножение: у мультипликативного
// хеша младшие биты повторяются, и все дома выходили одного цвета.
function hash(value) {
  let x = (value + 1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// Цвета пересобранного города: соседние номера не повторяются,
// и каждая семёрка сдвинута относительно предыдущей.
function migratedColor(order) {
  return (order * 3 + Math.floor(order / PALETTE.length)) % PALETTE.length;
}

// Детерминированно «случайное» здание: от номера уровня, а не от
// Math.random, иначе после отмены хода этаж уедет другому дому.
// Стопка выше MAX_CUBES не растёт — ищем следующую подходящую.
function pickUpgrade(city, level) {
  const count = city.buildings.length;
  if (count === 0) return null;
  const start = hash(level) % count;
  for (let i = 0; i < count; i += 1) {
    const building = city.buildings[(start + i) % count];
    if (buildingCubes(building.kind, building.floors + 1) > buildingCubes(building.kind, building.floors)) {
      return building;
    }
  }
  return null;
}

// --- раскладка ------------------------------------------------------------

// Участки нумеруются подряд, каждый PROP_EVERY-й отдан озеленению.
function plotOfBuilding(order) {
  return order + Math.floor(order / (PROP_EVERY - 1));
}

function isPropPlot(plot) {
  return plot % PROP_EVERY === PROP_EVERY - 1;
}

// Сколько построек должно поместиться на площадке при данной ступени
// камеры. Значение непрерывное: во время отъезда камеры ступень дробная.
function slotsForStage(stage) {
  return Math.min(MAX_BUILDINGS, DISTRICT_SIZE * (stage + 1));
}

// Участков больше, чем построек: часть отдана озеленению.
function plotsForStage(stage) {
  return (slotsForStage(stage) * PROP_EVERY) / (PROP_EVERY - 1);
}

const tallestCache = new Map();

// Самая высокая постройка среди номеров 1..slots — по ней считается,
// сколько места нужно над дальним краем площадки.
function tallestUpTo(slots) {
  const cached = tallestCache.get(slots);
  if (cached !== undefined) return cached;
  let tallest = 0;
  for (let order = 0; order < slots; order += 1) {
    tallest = Math.max(tallest, buildingHeightUnits(kindFor(order), 1));
  }
  // Надстроенные этажи упираются в MAX_CUBES — их тоже надо уместить.
  if (slots >= MAX_BUILDINGS) tallest = Math.max(tallest, MAX_CUBES + SLAB_HEIGHT);
  tallestCache.set(slots, tallest);
  return tallest;
}

function tallestUnits(stage) {
  const slots = slotsForStage(stage);
  const low = Math.floor(slots);
  const high = Math.ceil(slots);
  const a = tallestUpTo(low);
  return a + (tallestUpTo(high) - a) * (slots - low);
}

// Геометрия площадки. Единица масштаба — CITY_UNIT, высота городского
// кубика: она уменьшается ступенями камеры, а овал считается от неё
// и от фактического размера зоны, чтобы никогда не обрезаться.
function geometry(rect, city) {
  const stage = Math.max(0, Math.min(MAX_STAGE, city.stage));
  const plots = plotsForStage(stage);
  const radiusUnits = STEP_UNITS * Math.sqrt(Math.max(1, plots - 1)) + EDGE_UNITS;
  const tallest = tallestUnits(stage);
  const above = rect.height * PLATE_CENTER_Y - PLATE_MARGIN;
  const below = rect.height * (1 - PLATE_CENTER_Y) - PLATE_MARGIN;
  const byZoom = ((rect.height * START_HOUSE_SHARE) / (1 + GABLE_RISE)) * Math.pow(ZOOM_STEP, stage);
  const byWidth = (rect.width / 2 - PLATE_MARGIN) / radiusUnits;
  const byTop = above / (radiusUnits * MIN_PLATE_ASPECT + tallest);
  const byBottom = below / (radiusUnits * MIN_PLATE_ASPECT);
  const unit = Math.max(1, Math.min(byZoom, byWidth, byTop, byBottom));
  const rx = radiusUnits * unit;
  const ry = Math.min(rx * PLATE_ASPECT, above - tallest * unit, below);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height * PLATE_CENTER_Y,
    rx,
    ry,
    aspect: ry / rx,
    unit,
    plots
  };
}

function jitterOf(seed) {
  const a = ((seed >>> 3) % 1000) / 1000 - 0.5;
  const b = ((seed >>> 13) % 1000) / 1000 - 0.5;
  return { jx: a * 2 * JITTER, jy: b * 2 * JITTER };
}

// Филлотаксис: угол по золотому сечению, радиус по корню номера.
function plotPoint(geo, plot, seed) {
  const angle = plot * GOLDEN_ANGLE;
  const radius = STEP_UNITS * Math.sqrt(plot);
  const shift = jitterOf(seed);
  const u = Math.cos(angle) * radius + shift.jx * STEP_UNITS;
  const v = Math.sin(angle) * radius + shift.jy * STEP_UNITS;
  return { x: geo.x + u * geo.unit, y: geo.y + v * geo.unit * geo.aspect, unit: geo.unit };
}

function buildingPoint(geo, building) {
  return plotPoint(geo, plotOfBuilding(building.index), building.seed);
}

// --- запечённый макет -----------------------------------------------------

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
    const geo = geometry(local, city);
    city.ctx.clearRect(0, 0, w, h);
    drawGround(city.ctx, geo, city);
    const items = sceneItems(geo, city);
    for (let i = 0; i < items.length; i += 1) paintItem(city.ctx, items[i], 1);
    city.dirty = false;
  }
  return city.canvas;
}

// Постройка в момент появления: рисуется поверх запечённого макета.
export function drawBuilding(ctx, rect, city, pending, appear) {
  if (!pending) return;
  const geo = geometry(rect, city);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  paintItem(ctx, {
    building: pending.building,
    floors: pending.upgrade ? pending.floors : pending.building.floors,
    point: buildingPoint(geo, pending.building)
  }, appear);
  ctx.restore();
}

// Все объекты макета в одном списке и с явной точкой касания земли:
// глубина считается по основанию, иначе высокий дом «перекрывает»
// дерево, которое стоит ближе к зрителю.
function sceneItems(geo, city) {
  const items = [];
  const limit = Math.ceil(geo.plots);
  for (let plot = 0; plot < limit; plot += 1) {
    if (!isPropPlot(plot)) continue;
    const seed = hash(plot + 7919);
    const point = plotPoint(geo, plot, seed);
    items.push({ kind: propKind(plot, seed), point, seed });
  }
  for (let i = 0; i < city.buildings.length; i += 1) {
    const building = city.buildings[i];
    if (city.pending && city.pending.upgrade && city.pending.building === building) continue;
    items.push({ building, floors: building.floors, point: buildingPoint(geo, building) });
  }
  items.sort((a, b) => a.point.y - b.point.y);
  return items;
}

function propKind(plot, seed) {
  const roll = seed % 10;
  if (roll < 4) return 'treeSmall';
  if (roll < 6) return 'treeLarge';
  if (roll < 8) return 'bush';
  return plot > DISTRICT_SIZE ? 'lamp' : 'bush';
}

function paintItem(ctx, item, appear) {
  const unit = item.point.unit;
  const height = item.building
    ? buildingHeightUnits(item.building.kind, item.floors) * unit
    : propHeightUnits(item.kind) * unit;
  // Постройка выезжает снизу: поднимаем точку касания, а не сам объект.
  const y = item.point.y + (1 - appear) * (height + unit * 0.6);
  if (item.building) paintBuilding(ctx, item.building, item.point.x, y, unit, item.floors);
  else paintProp(ctx, item.kind, item.point.x, y, unit, item.seed);
}

// --- участок --------------------------------------------------------------

function drawGround(ctx, geo, city) {
  ctx.fillStyle = 'rgba(154, 123, 82, 0.12)';
  ctx.beginPath();
  ctx.ellipse(geo.x, geo.y + geo.ry * 0.06, geo.rx * 1.02, geo.ry * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(TABLE, 0.34);
  ctx.beginPath();
  ctx.ellipse(geo.x, geo.y, geo.rx, geo.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  if (city.buildings.length >= ROAD_FROM) drawRoad(ctx, geo);
  drawFence(ctx, geo);
}

function drawRoad(ctx, geo) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(geo.x, geo.y, geo.rx, geo.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(154, 123, 82, 0.22)';
  ctx.beginPath();
  ctx.moveTo(geo.x - geo.rx, geo.y + geo.ry * 0.22);
  ctx.lineTo(geo.x + geo.rx, geo.y - geo.ry * 0.52);
  ctx.lineTo(geo.x + geo.rx, geo.y - geo.ry * 0.12);
  ctx.lineTo(geo.x - geo.rx, geo.y + geo.ry * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Забор идёт по краю овала, нижние концы столбиков касаются поверхности.
function drawFence(ctx, geo) {
  const posts = 9;
  const points = [];
  for (let i = 0; i < posts; i += 1) {
    const angle = Math.PI * (1.12 + (i / (posts - 1)) * 0.76);
    points.push({
      x: geo.x + Math.cos(angle) * geo.rx * FENCE_RADIUS,
      y: geo.y + Math.sin(angle) * geo.ry * FENCE_RADIUS
    });
  }
  const height = geo.unit * 0.5;
  // Одна вытянутая тень на всю дугу, а не пятно под каждой секцией.
  drawShadowAlong(ctx, points, height, geo.unit * 0.2);
  ctx.strokeStyle = shade(WOOD, -0.08);
  ctx.lineWidth = Math.max(1.2, geo.unit * 0.05);
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
    const edge = i === 0 || i === points.length - 1;
    ctx.lineWidth = Math.max(1.2, geo.unit * (edge ? 0.08 : 0.05));
    ctx.beginPath();
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i].x, points[i].y - height * (edge ? 1.25 : 1));
    ctx.stroke();
  }
}

// --- постройки ------------------------------------------------------------

// Здание — стопка городских кубиков плюс крыша. Выступ получает верхний
// кубик, внутренние — нет, ровно как на игровом поле.
function paintBuilding(ctx, building, x, groundY, unit, floors) {
  const base = PALETTE[building.color % PALETTE.length];
  const cubes = buildingCubes(building.kind, floors);
  const half = cubeHalf(unit);
  const height = (cubes + roofUnits(building.kind)) * unit;
  if (building.lit) glow(ctx, x, groundY - height * 0.45, half * 2.4, height);
  drawShadow(ctx, x, groundY, height, half * 2 * SHADOW_SPREAD);
  for (let i = 0; i < cubes; i += 1) {
    drawBlock(ctx, x, groundY - (i + 1) * unit, half, base, 1, -1, building.lit);
  }
  const topY = groundY - cubes * unit;
  drawStud(ctx, x, topY, half, base);
  const roof = KIND_ROOF[building.kind];
  if (roof === 'gable') gableRoof(ctx, x, topY, half, base, GABLE_RISE * unit);
  else spire(ctx, x, topY, half, base, unit, roof === 'spire');
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

// Плоская крыша — плита из того же кубика, шире стопки и низкая.
// Со шпилем поверх плиты вырастает пирамидка: так выглядит доминанта.
function spire(ctx, x, topY, half, base, unit, withSpire) {
  const color = shade(base, ROOF_DARK);
  const slabHalf = half * (1 + SLAB_OVERHANG);
  const slabHeight = SLAB_HEIGHT * unit;
  const slabTop = topY - slabHeight;
  drawBlock(ctx, x, slabTop, slabHalf, color, slabHeight / cubeSideHeight(slabHalf));
  if (!withSpire) return;
  const apex = slabTop - SPIRE_RISE * unit;
  const w = half * 0.62;
  const h = w / 2;
  ctx.strokeStyle = shade(base, -OUTLINE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  triangle(ctx, x - w, slabTop, x, slabTop + h, x, apex, shade(color, -0.14));
  triangle(ctx, x + w, slabTop, x, slabTop + h, x, apex, shade(color, -0.34));
}

// Двускатная крыша: конёк идёт по диагонали верхней грани, к зрителю
// смотрят скат и фронтон. Без неё коробка читается как обычный кубик.
function gableRoof(ctx, x, y, w, base, rise) {
  const color = shade(base, ROOF_DARK);
  const h = w / 2;
  const west = { x: x - w, y };
  const north = { x, y: y - h };
  const east = { x: x + w, y };
  const south = { x, y: y + h };
  const ridgeBack = { x: x - w / 2, y: y - h / 2 - rise };
  const ridgeFront = { x: x + w / 2, y: y + h / 2 - rise };

  ctx.strokeStyle = shade(base, -OUTLINE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  quad(ctx, north, east, ridgeFront, ridgeBack, shade(color, -0.14));
  quad(ctx, west, south, ridgeFront, ridgeBack, shade(color, 0.06));
  triangle(ctx, south.x, south.y, east.x, east.y, ridgeFront.x, ridgeFront.y, shade(color, -0.34));
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

function triangle(ctx, ax, ay, bx, by, cx, cy, fill) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

// --- озеленение -----------------------------------------------------------

// Деревья, фонари и кусты — те же кубики, только уже и ниже.
function paintProp(ctx, kind, x, groundY, unit, seed) {
  drawShadow(ctx, x, groundY, propHeightUnits(kind) * unit, propWidthUnits(kind) * unit * SHADOW_SPREAD);
  const half = cubeHalf(unit);
  const green = CROWN_COLORS[seed % CROWN_COLORS.length];
  if (kind === 'bush') {
    stackBlock(ctx, x, groundY, half * BUSH_SCALE, BUSH_SCALE * unit, green, true);
    return;
  }
  if (kind === 'lamp') {
    const top = stackBlock(ctx, x, groundY, half * LAMP_POST_WIDTH, LAMP_POST_HEIGHT * unit, WOOD, false);
    stackBlock(ctx, x, top, half * LAMP_HEAD_WIDTH, LAMP_HEAD_HEIGHT * unit, LAMP_HEAD_COLOR, true);
    return;
  }
  let level = stackBlock(ctx, x, groundY, half * TRUNK_WIDTH, TRUNK_HEIGHT * unit, WOOD, false);
  if (kind === 'treeLarge') {
    for (let i = 0; i < CROWN_LARGE.length; i += 1) {
      const crown = CROWN_LARGE[i];
      level = stackBlock(ctx, x, level, half * crown.width, crown.height * unit, green, i === CROWN_LARGE.length - 1);
    }
    return;
  }
  stackBlock(ctx, x, level, half * CROWN_WIDTH, CROWN_HEIGHT * unit, green, true);
}

// Кубик заданной ширины и высоты на уровне baseY. Возвращает уровень
// верхней грани — на него встаёт следующая деталь.
function stackBlock(ctx, x, baseY, half, height, color, stud) {
  const top = baseY - height;
  drawBlock(ctx, x, top, half, color, height / cubeSideHeight(half));
  if (stud) drawStud(ctx, x, top, half, color);
  return top;
}
