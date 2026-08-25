// Единственная система теней сцены. Тень контактная: небольшое мягкое
// пятно почти строго под основанием объекта. Направленные тени
// переменной длины в этом стиле не работают — читаются как грязь.
//
// Размер пятна задаёт ширина основания, высота влияет только на плотность.
// Цвет тёплый: холодная тень на песочном столе выглядит пятном грязи.

const COLOR = '112, 84, 52';
const OFFSET_X = 0.06;
const OFFSET_Y = 0.02;
const CORE_RADIUS = 0.52;
const CORE_ALPHA = 0.2;
const HALO_RADIUS = 0.92;
const HALO_ALPHA = 0.07;
const ASPECT = 0.38;
const HEIGHT_FADE = 0.0006;
const HEIGHT_FADE_MIN = 0.65;
const CORE_SOLID = 0.55;
const HALO_SOLID = 0.2;
const SPRITE_LIMIT = 24;
const ALPHA_STEP = 0.01;
const SPRITE_SIZE = 96;

// Спрайты тени готовятся один раз: за кадр их десятки, а создавать
// градиент на каждую — это аллокации в цикле отрисовки.
const sprites = new Map();

// Высота объекта делает тень только бледнее — размер её не трогает.
export function shadowFactor(height, fade) {
  return Math.max(HEIGHT_FADE_MIN, Math.min(1, 1 - height * HEIGHT_FADE)) * fade;
}

// (x, y) — точка касания земли, width — ширина основания,
// height — высота объекта над этой точкой.
export function drawShadow(ctx, x, y, height, width, fade = 1) {
  if (width <= 0 || fade <= 0.02) return;
  const factor = shadowFactor(height, fade);
  if (factor * CORE_ALPHA < 0.01) return;
  const cx = x + width * OFFSET_X;
  const cy = y + width * OFFSET_Y;
  blot(ctx, cx, cy, width * HALO_RADIUS, HALO_ALPHA * factor, HALO_SOLID);
  blot(ctx, cx, cy, width * CORE_RADIUS, CORE_ALPHA * factor, CORE_SOLID);
}

function blot(ctx, x, y, rx, alpha, solid) {
  if (rx < 0.5) return;
  const ry = rx * ASPECT;
  const sprite = getSprite(alpha, solid);
  ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
}

function getSprite(alpha, solid) {
  const quantAlpha = Math.max(ALPHA_STEP, Math.round(alpha / ALPHA_STEP) * ALPHA_STEP);
  const key = `${quantAlpha}|${solid}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  if (sprites.size > SPRITE_LIMIT) sprites.clear();

  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d');
  const radius = SPRITE_SIZE / 2;
  // Мягкий край даёт радиальный градиент: ctx.filter = 'blur()' на
  // бюджетных Android стоит дороже всей остальной отрисовки кадра.
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${COLOR}, ${quantAlpha})`);
  gradient.addColorStop(solid, `rgba(${COLOR}, ${quantAlpha})`);
  gradient.addColorStop(1, `rgba(${COLOR}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();

  sprites.set(key, canvas);
  return canvas;
}

// Одна вытянутая тень на всю дугу: у забора на каждую секцию своей тени
// быть не должно, иначе получается пунктир из пятен.
export function drawShadowAlong(ctx, points, height, width) {
  if (points.length < 2) return;
  const factor = shadowFactor(height, 1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass += 1) {
    const halo = pass === 0;
    ctx.strokeStyle = `rgba(${COLOR}, ${(halo ? HALO_ALPHA : CORE_ALPHA) * factor})`;
    ctx.lineWidth = Math.max(1, width * (halo ? HALO_RADIUS * 2 : CORE_RADIUS * 2) * ASPECT);
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const px = points[i].x + width * OFFSET_X;
      const py = points[i].y + width * OFFSET_Y;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
