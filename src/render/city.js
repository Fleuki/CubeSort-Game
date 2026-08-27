// Макет города на столе. Растёт между уровнями, геймплей не трогает —
// это чистая награда. Собран из тех же кубиков, что и игровое поле:
// свой рендер деталей здесь не заводится, всё идёт через iso.js.

import { PALETTE, WOOD, TABLE, OUTLINE_DARK, OUTLINE_WIDTH, WINDOW_SQUARE, WINDOW_TALL, cubeSideHeight, drawBlock, drawStud, mix, shade } from './iso.js';
import { drawShadow, drawShadowAlong } from './shadow.js';
import {
  CUBE_WIDTH_UNITS, GABLE_RISE, SLAB_HEIGHT, SLAB_OVERHANG, SPIRE_RISE,
  CROWN_HEIGHT, CROWN_LARGE, CROWN_OVERLAP, CROWN_WIDTH, TRUNK_HEIGHT, TRUNK_WIDTH,
  LAMP_HEAD_HEIGHT, LAMP_HEAD_WIDTH, LAMP_POST_HEIGHT, LAMP_POST_WIDTH, BUSH_SCALE,
  KIND_ROOF, MAX_CUBES, buildingCubes, buildingHeightUnits, cubeHalf, propHeightUnits,
  propWidthUnits, roofUnits
} from './scale.js';

// Версия схемы города. Не совпала с сохранением — город пересобирается
// с нуля по актуальным правилам, прогресс уровней при этом цел.
export const CITY_SCHEMA_VERSION = 5;

// Ступени застройки: тип новой постройки зависит от того, сколько их уже.
// Дом даётся за пройденный уровень, поэтому пороги растянуты на десятки
// уровней — этап одноэтажных домиков должен успеть прожиться.
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
// Каждый четвёртый участок отдан озеленению: кусты и деревья приходят
// за собранные столбики, и мест под них нужно заметно больше, чем под дома.
const PROP_EVERY = 4;
const PROP_MAX_RANK = 2;
const LAMP_EVERY = 4;
// Реестр занятых точек: новый объект встаёт только туда, где до всех
// уже стоящих остаётся зазор. Не нашлось места за столько попыток —
// площадка считается полной.
const PLACE_ATTEMPTS = 40;
// Сдвиг из-под памятника: участков в конце игры почти не осталось,
// поэтому перебираем всю спираль, а не сорок ближайших точек.
const DISPLACE_ATTEMPTS = 400;
const PLOT_SLACK = 1.15;
const MIN_GAP = 0.25;
// Изометрия сжимает глубину, поэтому мало развести основания: объект,
// стоящий прямо перед другим, закрывает его телом. Пары, у которых
// основания перекрываются по горизонтали, разводим по глубине на долю
// высоты. Полностью убрать перекрытие нельзя: на площадку тогда влезает
// девять домов вместо шестидесяти.
const DEPTH_CLEAR = 0.7;
// Запас от крайней постройки до ограды: половина кубика плюс поле.
const EDGE_UNITS = CUBE_WIDTH_UNITS / 2 + 0.5;

// Овал: центр ниже середины зоны, вертикальное сжатие — как у кубика.
// Сплющить его можно, но не до полоски.
const PLATE_CENTER_Y = 0.6;
const PLATE_ASPECT = 0.5;
const MIN_PLATE_ASPECT = 0.36;
const PLATE_MARGIN = 8;
const FENCE_RADIUS = 0.97;
const FENCE_POSTS = 9;
const FENCE_POST_SCALE = 0.35;
const FENCE_POST_HEIGHT = 0.8;
// Стартовый масштаб: одноэтажный домик занимает эту долю высоты зоны,
// если такой город помещается в неё целиком.
const START_HOUSE_SHARE = 0.14;

const GLOW_ALPHA = 0.12;
const ROOF_DARK = -0.18;
// Пятно тени шире основания: под самим кубиком его не видно —
// низ детали накрывает пятно целиком.
const SHADOW_SPREAD = 1.6;
// Тёплая волна свечения от памятника расходится по всей площадке.
const MONUMENT_GLOW = '#FFD98A';
const MONUMENT_GLOW_SPREAD = 3.4;
const MONUMENT_GLOW_ALPHA = 0.5;
// Волна по площадке в момент приземления награды.
const RIPPLE_FROM = 0.3;
const RIPPLE_TO = 2.2;
const RIPPLE_ALPHA = 0.3;
const CROWN_COLORS = ['#5B9750', '#4C8547'];
const LAMP_HEAD_COLOR = '#E2A238';

// Отделка режима. Палитра зданий не меняется — цвет по-прежнему берётся
// от собранного столбика. Меняются крыша, окна, обводка и фонари.
const COLD = '#2F3A47';
const PLINTH_COLOR = '#B5AC9B';
const ANTENNA_COLOR = '#8C97A0';
const ANTENNA_FROM_CUBES = 3;
const ANTENNA_HEIGHT = 0.8;
const MATERIALS = {
  wood: { roof: 'gable', window: WINDOW_SQUARE, cool: 0, darker: 0, plinth: 0, lamp: WOOD, lampWidth: 1, antenna: false },
  stone: { roof: 'tiled', window: WINDOW_SQUARE, cool: 0.08, darker: 0, plinth: 0.2, lamp: '#4B4239', lampWidth: 1.2, antenna: false },
  glass: { roof: 'flat', window: WINDOW_TALL, cool: 0.1, darker: 0.1, plinth: 0, lamp: '#8C97A0', lampWidth: 0.75, antenna: true }
};
const TILE_ROWS = 4;
// Памятник за пройденный режим: постамент и обелиск из трёх кубиков,
// сужающихся кверху. Ширина — в долях кубика, высота — в CITY_UNIT.
const MONUMENT_PEDESTAL = { width: 1.15, height: 1 };
const MONUMENT_STEPS = [
  { width: 0.72, height: 1 },
  { width: 0.56, height: 1 },
  { width: 0.4, height: 1 }
];
// Радиус шире здания: вокруг памятника остаётся просвет, иначе его
// закрывают соседние башни.
// Навершие: у каждого материала своё, иначе три памятника отличались бы
// только тоном обводки. Всё вместе — не выше 0.6 кубика.
const FINIAL_POLE = 0.5;
const FINIAL_FLAG = 0.36;
const FINIAL_BALL = 0.28;
const FINIAL_SPIRE = 0.42;
const FINIAL_ANTENNA = 0.18;
const MONUMENT_RADIUS = CUBE_WIDTH_UNITS;
const MONUMENT_HEIGHT = MONUMENT_PEDESTAL.height + MONUMENT_STEPS.reduce((sum, step) => sum + step.height, 0);
const styleCache = new Map();

export function materialOf(city) {
  return MATERIALS[city.material] ? city.material : 'wood';
}

// Стиль детали: обводка материала и форма окна. Кешируется — в цикле
// запекания макета объекты создавать нельзя.
function blockStyle(material, base, lit) {
  const key = `${material}|${base}|${lit ? 1 : 0}`;
  const cached = styleCache.get(key);
  if (cached) return cached;
  const spec = MATERIALS[material] || MATERIALS.wood;
  const dark = shade(base, -(OUTLINE_DARK + spec.darker));
  const style = {
    outline: spec.cool > 0 ? mix(dark, COLD, spec.cool) : dark,
    window: lit ? spec.window : 0
  };
  styleCache.set(key, style);
  return style;
}

export function createCity(buildings = [], props = [], material = 'wood') {
  const city = {
    material,
    monument: null,
    buildings: buildings.slice(),
    props: props.slice(),
    // Памятник выезжает снизу: пока идёт анимация, макет перепекается.
    monumentRise: 1,
    // Награды в полёте занимают место в реестре: две одновременные
    // не должны выбрать одну и ту же точку.
    pendings: [],
    seq: 0,
    stage: 0,
    dirty: true,
    canvas: null,
    ctx: null,
    version: 0,
    places: null,
    placesVersion: -1
  };
  normalizeSeq(city);
  syncCamera(city);
  return city;
}

// Порядок создания объектов задаёт порядок их постановки в реестр.
function normalizeSeq(city) {
  let seq = 0;
  const all = city.buildings.concat(city.props);
  for (let i = 0; i < all.length; i += 1) seq = Math.max(seq, (all[i].seq || 0) + 1);
  city.seq = seq;
}

function nextSeq(city) {
  city.seq += 1;
  return city.seq;
}

function touch(city) {
  city.version += 1;
  city.dirty = true;
}

// Награда за ход: за пройденный уровень — дом, за отдельный собранный
// столбик — мелкая декорация по кругу площадки.
export function prepareReward(city, colorIndex, level, house) {
  const pending = house ? prepareBuilding(city, colorIndex, level) : prepareProp(city, level);
  if (pending) {
    city.pendings.push(pending);
    touch(city);
  }
  return pending;
}

function prepareBuilding(city, colorIndex, level) {
  const index = city.buildings.length + countPending(city, false);
  if (index < MAX_BUILDINGS) {
    const building = makeBuilding(index, nextSeq(city), colorIndex);
    building.plot = findPlot(city, building);
    if (building.plot >= 0) return { building, upgrade: false };
    city.seq -= 1;
  }
  // Места нет или площадка заполнена: этаж получает существующее здание.
  const target = pickUpgrade(city, level);
  return target ? { building: target, upgrade: true, floors: target.floors + 1 } : null;
}

// Свободный участок под декорацию, а если все заняты — подрастает
// самая мелкая: куст становится деревом, дерево — большим деревом.
// Лестница выбора цели. Каждый собранный столбик обязан дать ровно одно
// видимое изменение, поэтому порядок такой: сначала подрастить самое
// мелкое, потом занять новое место, и только в тупике — этаж зданию.
function prepareProp(city, level) {
  const before = visualHash(city, null);
  for (let step = 0; step < LADDER.length; step += 1) {
    const pending = LADDER[step](city, level);
    if (!pending) continue;
    if (visualHash(city, pending) !== before) return pending;
    // Предохранитель: выбранная цель ничего не меняет — это ошибка
    // выбора, а не нормальный ход. Возвращаем место и идём дальше.
    reportBurned(step);
    releasePending(city, pending);
  }
  // Ни один пункт лестницы не дал цели: площадка занята целиком, все
  // декорации в максимальной стадии, все дома упёрлись в потолок высоты.
  // Это не ошибка выбора, а физический предел макета.
  return null;
}

const LADDER = [
  (city) => growPending(city, 0),
  (city) => growPending(city, 1),
  (city) => freshPending(city),
  (city, level) => buildingFloorPending(city, level)
];

// Самая ранняя декорация нужной стадии, которой хватает места вырасти:
// город растёт от центра наружу, а не скачет. Стадия берётся с учётом
// награды, которая уже летит к этому объекту.
function growPending(city, rank) {
  for (let i = 0; i < city.props.length; i += 1) {
    const prop = city.props[i];
    const stage = effectiveStage(city, prop, prop.rank);
    if (stage !== rank || isLampSlot(prop.slot) || stage >= PROP_MAX_RANK) continue;
    if (!growthFits(city, prop, stage + 1)) continue;
    return { prop, upgrade: true, rank: stage + 1 };
  }
  return null;
}

// Стадия объекта с учётом уже летящих наград: две подряд не должны
// целиться в один и тот же куст.
function effectiveStage(city, item, fallback) {
  for (let i = 0; i < city.pendings.length; i += 1) {
    const pending = city.pendings[i];
    if (!pending.upgrade) continue;
    if (pending.prop === item) return pending.rank;
    if (pending.building === item) return pending.floors;
  }
  return fallback;
}

// Новый участок: куст, а на вехах застройки — фонарь.
function freshPending(city) {
  const slot = city.props.length + countPending(city, true);
  if (slot >= propSlotCount(city.stage)) return null;
  const prop = { slot, seq: nextSeq(city), rank: 0, seed: hash(slot + 7919), plot: -1 };
  prop.plot = findPlot(city, prop);
  if (prop.plot >= 0) return { prop, upgrade: false };
  city.seq -= 1;
  return null;
}

function buildingFloorPending(city, level) {
  const target = pickUpgrade(city, level);
  return target ? { building: target, upgrade: true, floors: effectiveStage(city, target, target.floors) + 1 } : null;
}

// Отменённая заготовка не должна съедать номер создания.
function releasePending(city, pending) {
  if (pending && !pending.upgrade && pending.prop && pending.prop.seq === city.seq) city.seq -= 1;
}

// Выросшая крона шире прежней — проверяем, что она никого не задевает.
function growthFits(city, prop, rank) {
  const point = plotWorld(prop.plot, prop.seed);
  const kind = propKind(prop.slot, rank);
  return fits(placesOf(city), point, propRadius(kind), propHeightUnits(kind), prop);
}

// Хеш видимого состояния города: тип, стадия, этажность и участок
// каждого объекта. Награды в полёте учитываются — две подряд не должны
// целиться в один и тот же куст.
function visualHash(city, extra) {
  const places = placesOf(city);
  let h = 2166136261;
  for (let i = 0; i < places.length; i += 1) h = mixItem(h, city, places[i].item, extra);
  if (extra && !extra.upgrade) h = mixItem(h, city, extra.prop || extra.building, extra);
  return h >>> 0;
}

const KIND_CODES = { bush: 1, treeSmall: 2, treeLarge: 3, lamp: 4, house1: 5, house2: 6, block3: 7, block4: 8, landmark: 9 };

function mixItem(h, city, item, extra) {
  const prop = isProp(item);
  let stage = effectiveStage(city, item, prop ? item.rank : item.floors);
  if (extra && extra.upgrade) {
    if (extra.prop === item) stage = extra.rank;
    else if (extra.building === item) stage = extra.floors;
  }
  const kind = prop ? propKind(item.slot, stage) : item.kind;
  return mix32(mix32(mix32(h, KIND_CODES[kind] || 0), stage), item.plot + 1);
}

function mix32(h, value) {
  return (Math.imul(h ^ (value >>> 0), 16777619) >>> 0);
}

// Предохранитель молчит всю игру. Заговорил — в выборе цели ошибка.
function reportBurned(step) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[city] награда не изменила город: пункт лестницы ${step + 1}`);
  }
}

function countPending(city, prop) {
  let count = 0;
  for (let i = 0; i < city.pendings.length; i += 1) {
    const pending = city.pendings[i];
    if (!pending.upgrade && Boolean(pending.prop) === prop) count += 1;
  }
  return count;
}

export function commitReward(city, pending) {
  if (!pending) return;
  const at = city.pendings.indexOf(pending);
  if (at >= 0) city.pendings.splice(at, 1);
  if (pending.prop) {
    if (pending.upgrade) pending.prop.rank = pending.rank;
    else city.props.push(pending.prop);
  } else if (pending.upgrade) {
    pending.building.floors = pending.floors;
  } else {
    city.buildings.push(pending.building);
  }
  touch(city);
}

// Загрузка сохранения: объекты приходят готовыми, порядок создания
// восстанавливается по seq.
export function loadCity(city, buildings, props, monument) {
  city.buildings = buildings.slice();
  city.props = props.slice();
  city.monument = monument || null;
  city.monumentRise = 1;
  city.pendings.length = 0;
  normalizeSeq(city);
  syncCamera(city);
  touch(city);
}

// Памятник ставится строго в центр площадки. Если центр занят, объект
// оттуда переезжает на ближайший свободный участок филлотаксиса.
export function grantMonument(city, medal, color) {
  if (city.monument) return false;
  city.monument = { medal, color };
  // По умолчанию памятник уже стоит: выезд снизу запускает вызывающий код.
  city.monumentRise = 1;
  touch(city);
  // Место памятника проверяется тем же правилом, что и все участки:
  // и по горизонтали, и по глубине — иначе его закроют телом соседа.
  const spot = [{ item: city.monument, u: 0, v: 0, r: MONUMENT_RADIUS, h: MONUMENT_HEIGHT }];
  const displaced = [];
  const items = city.buildings.concat(city.props);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.plot < 0) continue;
    const point = plotWorld(item.plot, item.seed);
    if (fits(spot, point, radiusOf(item), heightOf(item), item)) continue;
    displaced.push(item);
  }
  for (let i = 0; i < displaced.length; i += 1) {
    const item = displaced[i];
    const home = item.plot;
    item.plot = -1;
    touch(city);
    // Площадка к финалу забита, поэтому ищем дольше обычного; если
    // свободного участка нет вовсе — постройка остаётся на месте:
    // тесно стоящий дом лучше исчезнувшего.
    const plot = findPlot(city, item, DISPLACE_ATTEMPTS);
    item.plot = plot >= 0 ? plot : home;
    touch(city);
  }
  return true;
}

export function monumentRise(city, value) {
  city.monumentRise = value;
  city.dirty = true;
}

// Награды, не долетевшие до города к концу уровня, всё равно заработаны.
export function flushRewards(city) {
  while (city.pendings.length > 0) commitReward(city, city.pendings[0]);
}

export function resetCity(city) {
  city.buildings.length = 0;
  city.props.length = 0;
  city.pendings.length = 0;
  city.monument = null;
  city.monumentRise = 1;
  city.seq = 0;
  syncCamera(city);
  touch(city);
}

// Миграция: город собирается заново из числа пройденных уровней
// (дома) и числа собранных столбиков (декорации). Раскладка при этом
// та же, что при обычной игре — постановка идёт через тот же реестр.
export function rebuildCity(city, levels, columns) {
  city.buildings.length = 0;
  city.props.length = 0;
  city.pendings.length = 0;
  city.seq = 0;
  touch(city);
  const passed = Math.max(0, Math.floor(levels) || 0);
  const perLevel = passed > 0 ? Math.max(0, Math.floor(columns) || 0) / passed : 0;
  let placed = 0;
  for (let level = 0; level < passed; level += 1) {
    // Порядок тот же, что в игре: сначала декорации за столбики уровня,
    // потом дом за сам уровень.
    const want = Math.round((level + 1) * perLevel);
    while (placed < want) {
      commitReward(city, prepareReward(city, 0, level, false));
      placed += 1;
    }
    syncCamera(city);
    commitReward(city, prepareReward(city, migratedColor(level), level, true));
  }
  const districts = Math.floor(city.buildings.length / DISTRICT_SIZE);
  for (let i = 0; i < city.buildings.length; i += 1) {
    city.buildings[i].lit = city.buildings[i].district < districts;
  }
  syncCamera(city);
  touch(city);
}

// Снимок для отмены хода: меняться могут постройки, декорации,
// этажность, свет и ступень камеры.
export function snapshotCity(city) {
  return {
    stage: city.stage,
    seq: city.seq,
    buildings: city.buildings.slice(),
    props: city.props.slice(),
    floors: city.buildings.map((building) => building.floors),
    ranks: city.props.map((prop) => prop.rank),
    lit: city.buildings.map((building) => building.lit)
  };
}

export function restoreCity(city, snapshot) {
  if (!snapshot) return;
  city.buildings.length = 0;
  for (let i = 0; i < snapshot.buildings.length; i += 1) {
    const building = snapshot.buildings[i];
    building.floors = snapshot.floors[i];
    building.lit = snapshot.lit[i];
    city.buildings.push(building);
  }
  city.props.length = 0;
  for (let i = 0; i < snapshot.props.length; i += 1) {
    const prop = snapshot.props[i];
    prop.rank = snapshot.ranks[i];
    city.props.push(prop);
  }
  city.pendings.length = 0;
  city.seq = snapshot.seq;
  city.stage = snapshot.stage;
  touch(city);
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
    .map((building) => ({ building, x: screenPoint(geo, plotWorld(building.plot, building.seed)).x }))
    .sort((a, b) => a.x - b.x)
    .map((item) => item.building);
}

export function lightBuilding(city, building) {
  building.lit = true;
  city.dirty = true;
}

function makeBuilding(order, seq, colorIndex) {
  return {
    index: order,
    seq,
    plot: -1,
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

// Сколько этажей город уже надстроил: часть seed выбора здания.
function addedFloors(city) {
  let total = 0;
  for (let i = 0; i < city.buildings.length; i += 1) total += city.buildings[i].floors - 1;
  for (let i = 0; i < city.pendings.length; i += 1) {
    const pending = city.pendings[i];
    if (pending.upgrade && pending.building) total += 1;
  }
  return total;
}

// Детерминированно «случайное» здание: от номера уровня и числа уже
// выданных этажей, а не от Math.random, иначе после отмены хода этаж
// уедет другому дому.
// Стопка выше MAX_CUBES не растёт — ищем следующую подходящую.
function pickUpgrade(city, level) {
  const count = city.buildings.length;
  if (count === 0) return null;
  // Seed меняется с каждым выданным этажом, иначе все столбики уровня
  // уходили в один и тот же дом и он один вырастал в башню.
  const start = hash(level * 1000 + addedFloors(city)) % count;
  for (let i = 0; i < count; i += 1) {
    const building = city.buildings[(start + i) % count];
    if (buildingCubes(building.kind, building.floors + 1) > buildingCubes(building.kind, building.floors)) {
      return building;
    }
  }
  return null;
}

// --- раскладка ------------------------------------------------------------

// Номер участка, с которого начинается поиск места. Дома и озеленение
// расходятся по разным номерам, чтобы не толкаться с первой попытки,
// но занятость решает реестр, а не эта нумерация.
function plotOfBuilding(order) {
  return order + Math.floor(order / (PROP_EVERY - 1));
}

function plotOfProp(slot) {
  return slot * PROP_EVERY + PROP_EVERY - 1;
}

// Фонарь вместо дерева на каждом LAMP_EVERY-м участке: город должен
// быть не только зелёным.
function isLampSlot(slot) {
  return hash(slot + 4099) % LAMP_EVERY === 0;
}

// Фонарь стадий не имеет: он ставится сразу фонарём и целью апгрейда
// не бывает никогда. Расти умеют только куст и малое дерево.
function propKind(slot, rank) {
  if (isLampSlot(slot)) return 'lamp';
  if (rank <= 0) return 'bush';
  return rank === 1 ? 'treeSmall' : 'treeLarge';
}


function propRadius(kind) {
  return propWidthUnits(kind) / 2;
}

const BUILDING_RADIUS = CUBE_WIDTH_UNITS / 2;

// Сколько построек должно поместиться на площадке при данной ступени
// камеры. Значение непрерывное: во время отъезда камеры ступень дробная.
function slotsForStage(stage) {
  return Math.min(MAX_BUILDINGS, DISTRICT_SIZE * (stage + 1));
}

// Участков больше, чем построек: часть отдана озеленению, плюс запас
// на поиск. Без запаса первый же пропущенный участок выталкивал дом
// за площадку, дом не вставал, ступень камеры не росла — и город
// застревал навсегда.
function plotsForStage(stage) {
  return (slotsForStage(stage) * PROP_EVERY * PLOT_SLACK) / (PROP_EVERY - 1);
}

// Радиус площадки в CITY_UNIT — им ограничен и поиск участка,
// и сам овал: за ограду объекты не выходят.
function plateRadiusUnits(stage) {
  return STEP_UNITS * Math.sqrt(Math.max(1, plotsForStage(stage) - 1)) + EDGE_UNITS;
}

// Мест под озеленение столько же, сколько было до запаса: запас нужен
// поиску, а не декорациям.
function propSlotCount(stage) {
  return Math.floor(slotsForStage(Math.max(0, Math.min(MAX_STAGE, stage))) / (PROP_EVERY - 1));
}

// Филлотаксис: угол по золотому сечению, радиус по корню номера.
// Мировые координаты от масштаба и экрана не зависят — раскладка
// одинакова при любом размере окна и в любом запуске.
function plotWorld(plot, seed) {
  const angle = plot * GOLDEN_ANGLE;
  const radius = STEP_UNITS * Math.sqrt(Math.max(0, plot));
  const shift = jitterOf(seed);
  return {
    u: Math.cos(angle) * radius + shift.jx * STEP_UNITS,
    v: Math.sin(angle) * radius + shift.jy * STEP_UNITS
  };
}

function jitterOf(seed) {
  const a = ((seed >>> 3) % 1000) / 1000 - 0.5;
  const b = ((seed >>> 13) % 1000) / 1000 - 0.5;
  return { jx: a * 2 * JITTER, jy: b * 2 * JITTER };
}

// Единый реестр занятых точек: и дома, и деревья, и фонари, и кусты.
// Пересчитывается только при изменении набора объектов.
function placesOf(city) {
  if (city.places && city.placesVersion === city.version) return city.places;
  const places = [];
  const all = city.buildings.concat(city.props);
  for (let i = 0; i < city.pendings.length; i += 1) {
    const pending = city.pendings[i];
    if (pending.upgrade) continue;
    all.push(pending.prop || pending.building);
  }
  all.sort((a, b) => a.seq - b.seq);
  // Памятник стоит в самом центре и участвует в реестре наравне со всеми.
  if (city.monument) {
    places.push({ item: city.monument, u: 0, v: 0, r: MONUMENT_RADIUS, h: MONUMENT_HEIGHT });
  }
  for (let i = 0; i < all.length; i += 1) {
    const item = all[i];
    if (item.plot < 0) continue;
    const point = plotWorld(item.plot, item.seed);
    places.push({ item, u: point.u, v: point.v, r: radiusOf(item), h: heightOf(item) });
  }
  city.places = places;
  city.placesVersion = city.version;
  return places;
}

function isProp(item) {
  return item.rank !== undefined;
}

function radiusOf(item) {
  if (item.medal) return MONUMENT_RADIUS;
  return isProp(item) ? propRadius(propKind(item.slot, item.rank)) : BUILDING_RADIUS;
}

function heightOf(item) {
  if (item.medal) return MONUMENT_HEIGHT;
  return isProp(item)
    ? propHeightUnits(propKind(item.slot, item.rank))
    : buildingHeightUnits(item.kind, item.floors);
}

// Точка свободна, если до каждого соседа есть зазор по основаниям
// и пара не стоит одна перед другой вплотную по глубине.
function fits(places, point, radius, height, ignore) {
  for (let i = 0; i < places.length; i += 1) {
    const place = places[i];
    if (place.item === ignore) continue;
    const du = Math.abs(point.u - place.u);
    const dv = Math.abs(point.v - place.v);
    if (Math.hypot(du, dv) < radius + place.r + MIN_GAP) return false;
    if (du < radius + place.r && dv < DEPTH_CLEAR * Math.max(height, place.h)) return false;
  }
  return true;
}

// Поиск свободного участка для нового объекта: до PLACE_ATTEMPTS попыток
// по участкам своего класса, дальше площадка считается полной.
function findPlot(city, item, attempts = PLACE_ATTEMPTS) {
  const places = placesOf(city);
  const radius = radiusOf(item);
  const height = heightOf(item);
  const limit = plateRadiusUnits(city.stage) - MIN_GAP;
  let plot = isProp(item) ? plotOfProp(item.slot) : plotOfBuilding(item.index);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const point = plotWorld(plot, item.seed);
    // За ограду выходить нельзя: это уже не площадка.
    if (Math.hypot(point.u, point.v) + radius <= limit && fits(places, point, radius, height, item)) {
      return plot;
    }
    plot += 1;
  }
  return -1;
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
  const radiusUnits = plateRadiusUnits(stage);
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

// Мировая точка на экране. Единственное место перевода координат:
// траектория полёта награды считает её каждый кадр, поэтому масштаб
// и ступень камеры могут меняться прямо во время полёта.
function screenPoint(geo, point) {
  return { x: geo.x + point.u * geo.unit, y: geo.y + point.v * geo.unit * geo.aspect, unit: geo.unit };
}

// Куда летит награда: точка касания земли в городе и масштаб на месте.
export function rewardPoint(rect, city, pending) {
  const geo = geometry(rect, city);
  if (!pending) return { x: geo.x, y: geo.y, unit: geo.unit };
  const item = pending.prop || pending.building;
  if (!item || item.plot < 0) return { x: geo.x, y: geo.y, unit: geo.unit };
  return screenPoint(geo, plotWorld(item.plot, item.seed));
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
    for (let i = 0; i < items.length; i += 1) paintItem(city.ctx, items[i], materialOf(city), city.monumentRise);
    city.dirty = false;
  }
  return city.canvas;
}

// Награда в момент приземления: рисуется поверх запечённого макета
// со сплющиванием по вертикали — это её отскок.
export function drawReward(ctx, rect, city, pending, squash) {
  if (!pending) return;
  const point = rewardPoint(rect, city, pending);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  paintReward(ctx, pending, point.x, point.y, point.unit, squash, materialOf(city));
  ctx.restore();
}

// Награда в полёте: та же деталь, только с поворотом и своим масштабом.
export function drawRewardAt(ctx, city, pending, x, y, unit, angle) {
  if (!pending) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(-x, -y);
  paintReward(ctx, pending, x, y, unit, 1, materialOf(city));
  ctx.restore();
}

// Лёгкая волна по площадке от места приземления.
export function drawRipple(ctx, rect, city, ripple) {
  const geo = geometry(rect, city);
  const warm = Boolean(ripple.warm);
  const radius = warm
    ? geo.rx * ripple.t
    : geo.unit * CUBE_WIDTH_UNITS * (RIPPLE_FROM + (RIPPLE_TO - RIPPLE_FROM) * ripple.t);
  const x = warm ? geo.x : ripple.x;
  const y = warm ? geo.y : ripple.y;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(geo.x, geo.y, geo.rx, geo.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = (warm ? MONUMENT_GLOW_ALPHA : RIPPLE_ALPHA) * (1 - ripple.t);
  ctx.strokeStyle = warm ? MONUMENT_GLOW : '#FFFFFF';
  ctx.lineWidth = Math.max(1, geo.unit * (warm ? 0.5 : 0.12));
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * geo.aspect, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Все объекты макета в одном списке и с явной точкой касания земли:
// глубина считается по основанию, иначе высокий дом «перекрывает»
// дерево, которое стоит ближе к зрителю. Награда в полёте своего места
// в макете ещё не занимает — её рисует сцена.
function sceneItems(geo, city) {
  const places = placesOf(city);
  const items = [];
  for (let i = 0; i < places.length; i += 1) {
    const place = places[i];
    if (isPending(city, place.item)) continue;
    items.push({ item: place.item, point: screenPoint(geo, place) });
  }
  items.sort((a, b) => a.point.y - b.point.y);
  return items;
}

function isPending(city, item) {
  for (let i = 0; i < city.pendings.length; i += 1) {
    const pending = city.pendings[i];
    if (!pending.upgrade && (pending.prop === item || pending.building === item)) return true;
  }
  return false;
}

function paintItem(ctx, entry, material, rise) {
  const item = entry.item;
  const point = entry.point;
  if (item.medal) paintMonument(ctx, item, point.x, point.y, point.unit, material, rise);
  else if (isProp(item)) paintProp(ctx, propKind(item.slot, item.rank), point.x, point.y, point.unit, item.seed, material);
  else paintBuilding(ctx, item, point.x, point.y, point.unit, item.floors, material);
}

// Памятник: постамент и обелиск из трёх сужающихся кубиков в цвет
// медали. Отделка — материала режима, как у зданий.
function paintMonument(ctx, monument, x, groundY, unit, material, rise) {
  const style = blockStyle(material, monument.color, false);
  const half = cubeHalf(unit);
  const hidden = (1 - rise) * MONUMENT_HEIGHT * unit;
  drawShadow(ctx, x, groundY, MONUMENT_HEIGHT * unit, half * 2 * SHADOW_SPREAD, rise);
  // Тёплый ореол: без него памятник теряется среди шестикубовых башен.
  if (rise > 0) glow(ctx, x, groundY - MONUMENT_HEIGHT * unit * 0.5 * rise, half * MONUMENT_GLOW_SPREAD, MONUMENT_HEIGHT * unit);
  ctx.save();
  ctx.beginPath();
  // Выезд снизу: над землёй видна только успевшая подняться часть.
  ctx.rect(x - half * 3, groundY - MONUMENT_HEIGHT * unit * 2, half * 6, MONUMENT_HEIGHT * unit * 2 + half);
  ctx.clip();
  let level = groundY + hidden;
  level = stackBlock(ctx, x, level, half * MONUMENT_PEDESTAL.width, MONUMENT_PEDESTAL.height * unit, monument.color, false, style);
  let top = half;
  for (let i = 0; i < MONUMENT_STEPS.length; i += 1) {
    const step = MONUMENT_STEPS[i];
    top = half * step.width;
    level = stackBlock(ctx, x, level, top, step.height * unit, monument.color, i === MONUMENT_STEPS.length - 1, style);
  }
  monumentFinial(ctx, material, x, level, top, unit, monument.color, style);
  ctx.restore();
}

// Навершие в цвет медали: дерево — флажок на древке, камень — шар,
// стекло — шпиль с антенной.
function monumentFinial(ctx, material, x, topY, half, unit, color, style) {
  const outline = style && style.outline ? style.outline : shade(color, -OUTLINE_DARK);
  ctx.strokeStyle = outline;
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  if (material === 'stone') {
    const radius = FINIAL_BALL * unit;
    ctx.fillStyle = shade(color, 0.14);
    ctx.beginPath();
    ctx.arc(x, topY - radius, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Блик снизу слева: без него шар читается плоским кругом.
    ctx.fillStyle = shade(color, -0.2);
    ctx.beginPath();
    ctx.arc(x, topY - radius, radius, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (material === 'glass') {
    const apex = topY - FINIAL_SPIRE * unit;
    const w = half * 0.55;
    triangle(ctx, x - w, topY, x, topY + w * 0.5, x, apex, shade(color, -0.14));
    triangle(ctx, x + w, topY, x, topY + w * 0.5, x, apex, shade(color, -0.34));
    ctx.strokeStyle = shade(color, -0.4);
    ctx.lineWidth = Math.max(1, unit * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x, apex - FINIAL_ANTENNA * unit);
    ctx.stroke();
    ctx.fillStyle = shade(color, 0.2);
    ctx.beginPath();
    ctx.arc(x, apex - FINIAL_ANTENNA * unit, Math.max(1, unit * 0.07), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const poleTop = topY - FINIAL_POLE * unit;
  ctx.lineWidth = Math.max(1, unit * 0.06);
  ctx.strokeStyle = shade(color, -0.4);
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, poleTop);
  ctx.stroke();
  const flag = FINIAL_FLAG * unit;
  ctx.strokeStyle = outline;
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.fillStyle = shade(color, 0.12);
  ctx.beginPath();
  ctx.moveTo(x, poleTop);
  ctx.lineTo(x + flag, poleTop + flag * 0.34);
  ctx.lineTo(x, poleTop + flag * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function paintReward(ctx, pending, x, groundY, unit, squash, material) {
  const scaled = squash !== 1;
  if (scaled) {
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(1, squash);
    ctx.translate(-x, -groundY);
  }
  if (pending.prop) {
    const rank = pending.upgrade ? pending.rank : pending.prop.rank;
    paintProp(ctx, propKind(pending.prop.slot, rank), x, groundY, unit, pending.prop.seed, material);
  } else {
    const floors = pending.upgrade ? pending.floors : pending.building.floors;
    paintBuilding(ctx, pending.building, x, groundY, unit, floors, material);
  }
  if (scaled) ctx.restore();
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

// Забор по краю овала: столбики — те же кубики в масштабе 0.35,
// перекладины между ними. Линия в один пиксель на этом фоне пропадала.
function drawFence(ctx, geo) {
  const points = [];
  for (let i = 0; i < FENCE_POSTS; i += 1) {
    const angle = Math.PI * (1.12 + (i / (FENCE_POSTS - 1)) * 0.76);
    points.push({
      x: geo.x + Math.cos(angle) * geo.rx * FENCE_RADIUS,
      y: geo.y + Math.sin(angle) * geo.ry * FENCE_RADIUS
    });
  }
  const half = cubeHalf(geo.unit) * FENCE_POST_SCALE;
  const height = geo.unit * FENCE_POST_HEIGHT;
  // Одна вытянутая тень на всю дугу, а не пятно под каждой секцией.
  drawShadowAlong(ctx, points, height, half * 2 * SHADOW_SPREAD);
  ctx.strokeStyle = shade(WOOD, -0.24);
  ctx.lineWidth = Math.max(1.5, geo.unit * 0.1);
  ctx.lineCap = 'round';
  for (let rail = 0; rail < 2; rail += 1) {
    const lift = height * (rail === 0 ? 0.86 : 0.46);
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const py = points[i].y - lift;
      if (i === 0) ctx.moveTo(points[i].x, py);
      else ctx.lineTo(points[i].x, py);
    }
    ctx.stroke();
  }
  for (let i = 0; i < points.length; i += 1) {
    drawBlock(ctx, points[i].x, points[i].y - height, half, WOOD, height / cubeSideHeight(half));
  }
}

// --- постройки ------------------------------------------------------------

// Здание — стопка городских кубиков плюс крыша. Выступ получает верхний
// кубик, внутренние — нет, ровно как на игровом поле. Отделка — от
// материала режима: цоколь, форма крыши, окна, обводка, антенна.
function paintBuilding(ctx, building, x, groundY, unit, floors, material) {
  const spec = MATERIALS[material] || MATERIALS.wood;
  const base = PALETTE[building.color % PALETTE.length];
  const style = blockStyle(material, base, building.lit);
  const cubes = buildingCubes(building.kind, floors);
  const half = cubeHalf(unit);
  const height = (cubes + roofUnits(building.kind)) * unit;
  if (building.lit) glow(ctx, x, groundY - height * 0.45, half * 2.4, height);
  drawShadow(ctx, x, groundY, height, half * 2 * SHADOW_SPREAD);
  let level = groundY;
  if (spec.plinth > 0) {
    // Каменный цоколь: здание стоит на плите, а не прямо на песке.
    const plinth = spec.plinth * unit;
    const plinthHalf = half * (1 + SLAB_OVERHANG);
    drawBlock(ctx, x, level - plinth, plinthHalf, PLINTH_COLOR, plinth / cubeSideHeight(plinthHalf), -1, style);
    level -= plinth;
  }
  for (let i = 0; i < cubes; i += 1) {
    drawBlock(ctx, x, level - (i + 1) * unit, half, base, 1, -1, style);
  }
  const topY = level - cubes * unit;
  drawStud(ctx, x, topY, half, base, style.outline);
  paintRoof(ctx, building.kind, spec, x, topY, half, base, unit, style);
  if (spec.antenna && cubes > ANTENNA_FROM_CUBES) antenna(ctx, x, topY - SLAB_HEIGHT * unit, unit);
}

// Крыша: форму задаёт тип здания, отделку — материал. Доминанта
// остаётся со шпилем в любом материале.
function paintRoof(ctx, kind, spec, x, topY, half, base, unit, style) {
  const roof = KIND_ROOF[kind];
  if (roof === 'spire') {
    spire(ctx, x, topY, half, base, unit, true, style);
    return;
  }
  if (roof === 'gable' && spec.roof !== 'flat') {
    gableRoof(ctx, x, topY, half, base, GABLE_RISE * unit, style, spec.roof === 'tiled');
    return;
  }
  spire(ctx, x, topY, half, base, unit, false, style);
  if (spec.roof === 'flat') metalEdge(ctx, x, topY - SLAB_HEIGHT * unit, half * (1 + SLAB_OVERHANG));
}

// Тонкая металлическая кромка по краю плоской крыши.
function metalEdge(ctx, x, y, w) {
  ctx.strokeStyle = ANTENNA_COLOR;
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y + w / 2);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

function antenna(ctx, x, y, unit) {
  const height = ANTENNA_HEIGHT * unit;
  ctx.strokeStyle = ANTENNA_COLOR;
  ctx.lineWidth = Math.max(1, unit * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - height);
  ctx.stroke();
  ctx.fillStyle = ANTENNA_COLOR;
  ctx.beginPath();
  ctx.arc(x, y - height, Math.max(1, unit * 0.08), 0, Math.PI * 2);
  ctx.fill();
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
function spire(ctx, x, topY, half, base, unit, withSpire, style) {
  const color = shade(base, ROOF_DARK);
  const slabHalf = half * (1 + SLAB_OVERHANG);
  const slabHeight = SLAB_HEIGHT * unit;
  const slabTop = topY - slabHeight;
  drawBlock(ctx, x, slabTop, slabHalf, color, slabHeight / cubeSideHeight(slabHalf), -1, style);
  if (!withSpire) return;
  const apex = slabTop - SPIRE_RISE * unit;
  const w = half * 0.62;
  const h = w / 2;
  ctx.strokeStyle = style ? style.outline : shade(base, -OUTLINE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  triangle(ctx, x - w, slabTop, x, slabTop + h, x, apex, shade(color, -0.14));
  triangle(ctx, x + w, slabTop, x, slabTop + h, x, apex, shade(color, -0.34));
}

// Двускатная крыша: конёк идёт по диагонали верхней грани, к зрителю
// смотрят скат и фронтон. Без неё коробка читается как обычный кубик.
function gableRoof(ctx, x, y, w, base, rise, style, tiled) {
  const color = shade(base, ROOF_DARK);
  const h = w / 2;
  const west = { x: x - w, y };
  const north = { x, y: y - h };
  const east = { x: x + w, y };
  const south = { x, y: y + h };
  const ridgeBack = { x: x - w / 2, y: y - h / 2 - rise };
  const ridgeFront = { x: x + w / 2, y: y + h / 2 - rise };

  ctx.strokeStyle = style ? style.outline : shade(base, -OUTLINE_DARK);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  quad(ctx, north, east, ridgeFront, ridgeBack, shade(color, -0.14));
  quad(ctx, west, south, ridgeFront, ridgeBack, shade(color, 0.06));
  triangle(ctx, south.x, south.y, east.x, east.y, ridgeFront.x, ridgeFront.y, shade(color, -0.34));
  if (tiled) {
    tiles(ctx, north, east, ridgeFront, ridgeBack, shade(color, -0.3));
    tiles(ctx, west, south, ridgeFront, ridgeBack, shade(color, -0.16));
  }
}

// Черепица: поперечные насечки вдоль ската. Форма крыши та же.
function tiles(ctx, a, b, c, d, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let row = 1; row < TILE_ROWS; row += 1) {
    const t = row / TILE_ROWS;
    ctx.beginPath();
    ctx.moveTo(a.x + (d.x - a.x) * t, a.y + (d.y - a.y) * t);
    ctx.lineTo(b.x + (c.x - b.x) * t, b.y + (c.y - b.y) * t);
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
function paintProp(ctx, kind, x, groundY, unit, seed, material) {
  const spec = MATERIALS[material] || MATERIALS.wood;
  drawShadow(ctx, x, groundY, propHeightUnits(kind) * unit, propWidthUnits(kind) * unit * SHADOW_SPREAD);
  const half = cubeHalf(unit);
  const green = CROWN_COLORS[seed % CROWN_COLORS.length];
  if (kind === 'bush') {
    stackBlock(ctx, x, groundY, half * BUSH_SCALE, BUSH_SCALE * unit, green, true);
    return;
  }
  if (kind === 'lamp') {
    // Столб фонаря — материал режима: дерево, ковка, металл.
    const top = stackBlock(ctx, x, groundY, half * LAMP_POST_WIDTH * spec.lampWidth, LAMP_POST_HEIGHT * unit, spec.lamp, false);
    stackBlock(ctx, x, top, half * LAMP_HEAD_WIDTH, LAMP_HEAD_HEIGHT * unit, LAMP_HEAD_COLOR, true);
    return;
  }
  let level = stackBlock(ctx, x, groundY, half * TRUNK_WIDTH, TRUNK_HEIGHT * unit, WOOD, false);
  if (kind === 'treeLarge') {
    for (let i = 0; i < CROWN_LARGE.length; i += 1) {
      const crown = CROWN_LARGE[i];
      // Верхняя крона утоплена в нижнюю: поставленные встык кубики
      // читались как два дерева в одной точке, а не как одно.
      const base = i === 0 ? level : level + CROWN_OVERLAP * unit;
      level = stackBlock(ctx, x, base, half * crown.width, crown.height * unit, green, i === CROWN_LARGE.length - 1);
    }
    return;
  }
  stackBlock(ctx, x, level, half * CROWN_WIDTH, CROWN_HEIGHT * unit, green, true);
}

// Кубик заданной ширины и высоты на уровне baseY. Возвращает уровень
// верхней грани — на него встаёт следующая деталь.
function stackBlock(ctx, x, baseY, half, height, color, stud, style) {
  const top = baseY - height;
  drawBlock(ctx, x, top, half, color, height / cubeSideHeight(half), -1, style);
  if (stud) drawStud(ctx, x, top, half, color, style && style.outline);
  return top;
}
