// Единая сетка масштабов макета. Базовая единица UNIT — высота
// одноэтажного домика; всё остальное задаётся в этих единицах, иначе
// колодец вырастает с многоэтажку, а дерево — с башню.

export const FLOOR_UNITS = 0.7;

const HEIGHT_UNITS = {
  house1: 1,
  house2: 1.7,
  tower: 2.5,
  landmark: 3.4,
  treeSmall: 0.9,
  treeLarge: 1.3,
  lamp: 0.8,
  bush: 0.35,
  bridge: 0.5
};

// Ширина основания — не больше 0.9 UNIT, иначе город превращается в стену.
const WIDTH_UNITS = {
  house1: 0.9,
  house2: 0.86,
  tower: 0.82,
  landmark: 0.86,
  treeSmall: 0.5,
  treeLarge: 0.62,
  lamp: 0.14,
  bush: 0.42,
  bridge: 0.9
};

export function heightUnits(kind, floors = 1) {
  return (HEIGHT_UNITS[kind] || 1) + Math.max(0, floors - 1) * FLOOR_UNITS;
}

export function widthUnits(kind) {
  return Math.min(0.9, WIDTH_UNITS[kind] || 0.6);
}
