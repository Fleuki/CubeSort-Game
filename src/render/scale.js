// Единая сетка масштабов города. CITY_UNIT — высота одного городского
// кубика, и это тот же кубик, что на игровом поле: пропорции берутся
// из iso.js, а не выдумываются заново. Всё остальное задаётся
// в этих единицах, иначе дерево вырастает с башню.

import { cubeSideHeight } from './iso.js';

// Полуширина кубика, у которого боковая грань высотой ровно в unit.
export function cubeHalf(unit) {
  return unit / cubeSideHeight(1);
}

// Ширина кубика в CITY_UNIT: кубик в изометрии 2:1 заметно шире, чем выше.
export const CUBE_WIDTH_UNITS = cubeHalf(2);

// Ступени застройки: сколько кубиков в стопке и чем она накрыта.
export const KIND_CUBES = { house1: 1, house2: 2, block3: 3, block4: 4, landmark: 5 };
export const KIND_ROOF = { house1: 'gable', house2: 'gable', block3: 'slab', block4: 'slab', landmark: 'spire' };

export const GABLE_RISE = 0.3;
export const SLAB_HEIGHT = 0.18;
// Плита плоской крыши шире стопки на 8% с каждой стороны.
export const SLAB_OVERHANG = 0.08;
export const SPIRE_RISE = 1;
// Потолок этажности: этажи добавляются, когда площадка заполнена,
// и бесконечно расти стопка не должна — иначе она вылезет из зоны.
export const MAX_CUBES = 6;

export function roofUnits(kind) {
  const roof = KIND_ROOF[kind];
  if (roof === 'gable') return GABLE_RISE;
  if (roof === 'spire') return SLAB_HEIGHT + SPIRE_RISE;
  return SLAB_HEIGHT;
}

export function buildingCubes(kind, floors = 1) {
  return Math.min(MAX_CUBES, (KIND_CUBES[kind] || 1) + Math.max(0, floors - 1));
}

export function buildingHeightUnits(kind, floors = 1) {
  return buildingCubes(kind, floors) + roofUnits(kind);
}

// Озеленение. Ширины — в долях ширины кубика, высоты — в CITY_UNIT.
export const TRUNK_WIDTH = 0.3;
// Ствол выше половины глубины кроны: иначе крона свисает до земли
// и дерево читается как зелёный кубик без ствола.
export const TRUNK_HEIGHT = 0.8;
export const CROWN_WIDTH = 1.1;
export const CROWN_HEIGHT = 0.9;
// Большое дерево: крона из двух кубиков, верхний уже нижнего.
export const CROWN_LARGE = [{ width: 1.15, height: 0.75 }, { width: 0.9, height: 0.85 }];
// Насколько верхняя крона утоплена в нижнюю.
export const CROWN_OVERLAP = 0.3;
export const LAMP_POST_WIDTH = 0.12;
export const LAMP_POST_HEIGHT = 1.2;
export const LAMP_HEAD_WIDTH = 0.34;
export const LAMP_HEAD_HEIGHT = 0.3;
export const BUSH_SCALE = 0.5;

const PROP_HEIGHT = {
  treeSmall: TRUNK_HEIGHT + CROWN_HEIGHT,
  treeLarge: TRUNK_HEIGHT + CROWN_LARGE[0].height + CROWN_LARGE[1].height - CROWN_OVERLAP,
  lamp: LAMP_POST_HEIGHT + LAMP_HEAD_HEIGHT,
  bush: BUSH_SCALE
};

// Ширина, по которой считается тень и место на площадке.
const PROP_WIDTH = {
  treeSmall: CROWN_WIDTH,
  treeLarge: CROWN_LARGE[0].width,
  lamp: LAMP_HEAD_WIDTH,
  bush: BUSH_SCALE
};

export function propHeightUnits(kind) {
  return PROP_HEIGHT[kind] || 1;
}

export function propWidthUnits(kind) {
  return (PROP_WIDTH[kind] || 1) * CUBE_WIDTH_UNITS;
}
