// Три режима сложности. Все числа режимов живут здесь: кривые уровней,
// глубина перемешивания, бесплатные подсказки, материал города и пороги
// медалей. В других файлах магических чисел про режимы быть не должно.

export const MODE_IDS = ['easy', 'normal', 'hard'];
export const DEFAULT_MODE = 'normal';

export const LEVEL_COUNT = 60;

// Медаль зависит только от того, какой режим пройден целиком: качество
// игры она не измеряет. Цвета — металл значка на карточке режима.
const MEDAL_BY_MODE = { easy: 'bronze', normal: 'silver', hard: 'gold' };
export const MEDAL_COLORS = { bronze: '#A8703C', silver: '#B9BCC2', gold: '#D9A62B' };

// Полосы кривой: до какого уровня действует, сколько цветов (от и до),
// вместимость столбика и сколько столбиков сверх числа цветов.
const CURVES = {
  easy: [
    { until: 5, colors: [3, 3], capacity: 3, extraPosts: 2 },
    { until: 20, colors: [3, 4], capacity: 4, extraPosts: 2 },
    { until: 40, colors: [4, 5], capacity: 4, extraPosts: 2 },
    { until: LEVEL_COUNT, colors: [5, 5], capacity: 4, extraPosts: 2 }
  ],
  normal: [
    { until: 10, colors: [4, 4], capacity: 4, extraPosts: 2 },
    { until: 30, colors: [5, 5], capacity: 4, extraPosts: 2 },
    { until: 50, colors: [6, 6], capacity: 4, extraPosts: 1 },
    { until: LEVEL_COUNT, colors: [6, 6], capacity: 5, extraPosts: 1 }
  ],
  hard: [
    { until: 10, colors: [5, 5], capacity: 5, extraPosts: 2 },
    { until: 30, colors: [6, 6], capacity: 5, extraPosts: 1 },
    { until: 50, colors: [7, 7], capacity: 5, extraPosts: 1 },
    { until: LEVEL_COUNT, colors: [7, 7], capacity: 5, extraPosts: 1 }
  ]
};

// Название и подпись режима лежат ключами: строки живут в словаре,
// игровой модуль о языке не знает.
export const MODES = {
  easy: {
    id: 'easy',
    titleKey: 'mode.easy.title',
    noteKey: 'mode.easy.note',
    material: 'wood',
    shuffleFactor: 0.8,
    // Первые уровни — обучение без текста, они решаются за два-три хода.
    tutorial: true,
    free: { undo: 5, hint: 3, post: 1 },
    seedBase: 7919
  },
  normal: {
    id: 'normal',
    titleKey: 'mode.normal.title',
    noteKey: 'mode.normal.note',
    material: 'stone',
    shuffleFactor: 1,
    tutorial: true,
    free: { undo: 3, hint: 2, post: 1 },
    seedBase: 15667
  },
  hard: {
    id: 'hard',
    titleKey: 'mode.hard.title',
    noteKey: 'mode.hard.note',
    material: 'glass',
    shuffleFactor: 1.35,
    // В сложном обучения нет: первый уровень сразу настоящий.
    tutorial: false,
    free: { undo: 2, hint: 1, post: 1 },
    seedBase: 23417
  }
};

export function modeConfig(mode) {
  return MODES[mode] || MODES[DEFAULT_MODE];
}

// Цвета внутри полосы набегают равномерно: полоса «3–4» первую половину
// идёт на трёх цветах, вторую на четырёх.
export function levelConfig(mode, id) {
  const curve = CURVES[mode] || CURVES[DEFAULT_MODE];
  let start = 1;
  for (let i = 0; i < curve.length; i += 1) {
    const band = curve[i];
    const last = i === curve.length - 1;
    if (id <= band.until || last) {
      const span = band.until - start + 1;
      const steps = band.colors[1] - band.colors[0] + 1;
      const offset = Math.min(Math.max(0, id - start), span - 1);
      const colors = Math.min(band.colors[1], band.colors[0] + Math.floor((offset * steps) / span));
      return { colors, capacity: band.capacity, posts: colors + band.extraPosts };
    }
    start = band.until + 1;
  }
  return { colors: 4, capacity: 4, posts: 6 };
}

export function levelSeed(mode, id) {
  return (id * modeConfig(mode).seedBase + 13) >>> 0;
}

// Медаль даётся за пройденные все уровни режима — и только за это.
export function medalFor(mode, level) {
  return level > LEVEL_COUNT ? MEDAL_BY_MODE[mode] || null : null;
}
