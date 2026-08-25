// Единственная система теней сцены: столбики, кубики, город и декорации
// ходят через неё. Тень строится от точки касания земли, поэтому между
// объектом и его тенью нет зазора.
//
// Свет — сверху-слева, тени падают вправо-вниз. Чем выше объект, тем
// длиннее, мягче и бледнее тень: именно это отличает объём от аппликации.

const COLOR = '92, 70, 44';
const OFFSET_X = 0.42;
const OFFSET_Y = 0.16;
const RADIUS_OF_WIDTH = 0.62;
const RADIUS_OF_HEIGHT = 0.1;
const RADIUS_ASPECT = 0.42;
const ALPHA_BASE = 0.26;
const ALPHA_FALLOFF = 0.0007;
const ALPHA_MIN = 0.1;
const BLUR_BASE = 3;
const BLUR_OF_HEIGHT = 0.045;
const SOLID_CORE = 0.65;
const CORE_MIN = 0.3;
const CONTACT_OVERLAP = 0.3;
const SPRITE_LIMIT = 48;
const SPRITE_STEP = 2;
const ALPHA_STEP = 0.02;

// Готовые спрайты теней: за кадр их десятки, а создавать градиент
// на каждую — это аллокации в цикле отрисовки.
const sprites = new Map();

export function shadowMetrics(height, width) {
  const h = Math.max(0, height);
  const rx = width * RADIUS_OF_WIDTH + h * RADIUS_OF_HEIGHT;
  // Ближний край эллипса обязан перекрывать основание: у очень высоких
  // объектов смещение обгоняет радиус, и тень отрывается.
  const offsetX = Math.min(h * OFFSET_X, rx - width * CONTACT_OVERLAP);
  const blur = BLUR_BASE + h * BLUR_OF_HEIGHT;
  return {
    offsetX,
    offsetY: h * OFFSET_Y,
    rx,
    ry: rx * RADIUS_ASPECT,
    alpha: Math.max(ALPHA_MIN, Math.min(ALPHA_BASE, ALPHA_BASE - h * ALPHA_FALLOFF)),
    core: Math.max(CORE_MIN, Math.min(SOLID_CORE, 1 - blur / (rx * 0.6)))
  };
}

// (x, y) — точка касания земли. height — высота объекта над этой точкой,
// width — ширина его основания.
export function drawShadow(ctx, x, y, height, width, fade = 1, squeeze = 1) {
  if (fade <= 0.02 || width <= 0) return;
  const m = shadowMetrics(height, width);
  const rx = m.rx * squeeze;
  const ry = m.ry * squeeze;
  const alpha = m.alpha * fade;
  if (rx < 1 || alpha < 0.01) return;
  // Спрайт круглый, эллипс получается растяжением при отрисовке —
  // поэтому один спрайт обслуживает любую пропорцию.
  const sprite = getSprite(rx, alpha, m.core);
  ctx.drawImage(sprite.canvas, x + m.offsetX * squeeze - rx, y + m.offsetY * squeeze - ry, rx * 2, ry * 2);
}

function getSprite(rx, alpha, core) {
  const radius = Math.max(2, Math.round(rx / SPRITE_STEP) * SPRITE_STEP);
  const quantAlpha = Math.max(ALPHA_STEP, Math.round(alpha / ALPHA_STEP) * ALPHA_STEP);
  const quantCore = Math.round(core * 10) / 10;
  const key = `${radius}|${quantAlpha}|${quantCore}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  if (sprites.size > SPRITE_LIMIT) sprites.clear();

  const size = Math.ceil(radius * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Мягкий край даёт радиальный градиент: ctx.filter = 'blur()' на
  // бюджетных Android стоит дороже всей отрисовки кадра.
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${COLOR}, ${quantAlpha})`);
  gradient.addColorStop(quantCore, `rgba(${COLOR}, ${quantAlpha})`);
  gradient.addColorStop(1, `rgba(${COLOR}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();

  const sprite = { canvas, radius };
  sprites.set(key, sprite);
  return sprite;
}

// Одна вытянутая тень на всю дугу: у забора на каждую секцию своей тени
// быть не должно, иначе получается пунктир из пятен.
export function drawShadowAlong(ctx, points, height, width) {
  if (points.length < 2) return;
  const m = shadowMetrics(height, width);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass += 1) {
    // Первый проход — мягкое гало, второй — плотное ядро.
    const spread = pass === 0 ? 2.2 : 1;
    ctx.strokeStyle = `rgba(${COLOR}, ${m.alpha * (pass === 0 ? 0.45 : 1)})`;
    ctx.lineWidth = Math.max(1, m.ry * spread);
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const px = points[i].x + m.offsetX;
      const py = points[i].y + m.offsetY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
