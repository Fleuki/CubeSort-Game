// Отрисовка кадра целиком. Модуль только читает view — состояние
// игры он не меняет.

import { drawCube, drawPostBase, drawStuds, drawCap, drawTargetRing, SKY_TOP, TABLE, FIELD, INK, mix, shade } from './iso.js';
import { drawShadow } from './shadow.js';
import { getCityCanvas, drawRewardAt, drawRipple } from './city.js';
import { slotPosition } from './layout.js';
import { drawParticles } from '../anim/fx.js';
import { EASING } from '../anim/tween.js';

const HINT_ALPHA = 0.9;
// Подскок кубика в волне — доля его собственной высоты.
const WAVE_RISE = 0.06;
// Подскок длится два шага волны: за один шаг глаз его не успевает поймать.
const WAVE_HOP_STEPS = 2;
const HAND_SHADOW_FADE = 0.6;
const FLIGHT_SHADOW_FADE = 0.7;
// Стык зон: мягкий переход, а не линия.
const ZONE_BLEND = 40;
// Вспышка-кольцо при сборке столбика: радиус в ширинах кубика.
const BURST_FROM = 0.4;
const BURST_TO = 1.8;
const BURST_ALPHA = 0.5;
const BURST_WIDTH = 2.5;
// Крышка падает с высоты 1.2 кубика.
const CAP_DROP = 1.2;

export function drawScene(ctx, view) {
  const { layout, fx } = view;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawBackground(ctx, layout);

  ctx.translate(fx.shakeX, fx.shakeY);
  drawCity(ctx, view);
  drawPosts(ctx, view);
  drawBurst(ctx, view);
  drawHand(ctx, view);
  drawFlight(ctx, view);
  drawParticles(ctx, fx);
  drawFlyingReward(ctx, view);
  ctx.translate(-fx.shakeX, -fx.shakeY);
  if (view.fade > 0) {
    ctx.globalAlpha = view.fade;
    ctx.fillStyle = SKY_TOP;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }
}

// Небо и стол над городом остаются прежними, ниже зоны города фон уходит
// в более тёмный и холодный тон: жёлтый кубик на светлом песке пропадал.
function drawBackground(ctx, layout) {
  const cityBottom = layout.city.y + layout.city.height;
  const height = layout.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  const seam = Math.min(0.999, cityBottom / height);
  gradient.addColorStop(0, SKY_TOP);
  // Цвет на стыке — ровно тот, что давал прежний градиент: выше стыка
  // ничего не меняется.
  gradient.addColorStop(seam, mix(SKY_TOP, TABLE, Math.min(1, seam / 0.55)));
  gradient.addColorStop(Math.min(0.999, (cityBottom + ZONE_BLEND) / height), FIELD);
  gradient.addColorStop(1, shade(FIELD, -0.08));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, height);
}

function drawCity(ctx, view) {
  const rect = view.layout.city;
  const canvas = getCityCanvas(view.city, rect);
  ctx.drawImage(canvas, rect.x, rect.y);
  if (view.ripple) drawRipple(ctx, rect, view.city, view.ripple);
  if (view.cityAppear) view.cityAppear.draw(ctx, rect);
}

function postOffset(view, index) {
  if (view.shake && view.shake.index === index) return view.shake.offset;
  return 0;
}

function drawPosts(ctx, view) {
  const { layout, posts } = view;
  for (let i = 0; i < posts.length; i += 1) {
    const dx = postOffset(view, i);
    const post = layout.posts[i];
    const size = layout.size * post.scale;
    const step = layout.step * post.scale;
    // Кубики, поднятые в руку или летящие, со штыря убираются —
    // иначе группа рисуется дважды.
    let hiddenTop = view.hidden && view.hidden.post === i ? view.hidden.count : 0;
    if (view.hand && view.hand.from === i) hiddenTop += view.hand.count;
    const visible = posts[i].length - hiddenTop;
    ctx.translate(dx, 0);
    drawPostBase(ctx, post.x, post.baseY, size, visible === 0);
    if (view.hint && (view.hint.from === i || view.hint.to === i)) {
      drawHintMark(ctx, layout, post, view.hintPulse, view.hint.from === i);
    }
    for (let slot = 0; slot < visible; slot += 1) {
      const pos = slotPosition(layout, i, slot);
      const wave = waveOffset(view, i, slot, step);
      const squash = landingSquash(view, i, slot);
      drawCube(ctx, pos.x, pos.y - wave, size, posts[i][slot], squash);
    }
    // Кольцо цели — поверх кубиков, иначе его закрывает нижний кубик.
    if (view.targets && view.targets[i]) drawTargetRing(ctx, post.x, post.baseY, size, visible === 0);
    if (visible > 0) {
      const top = slotPosition(layout, i, visible - 1);
      const topY = top.y - waveOffset(view, i, visible - 1, step);
      const cap = capState(view, i);
      // Собранный столбик закрыт крышкой, и выступ под ней не нужен —
      // крышка на него и надета.
      if (cap) {
        if (cap.visible) drawCap(ctx, top.x, topY - cap.lift * step * CAP_DROP, size, posts[i][visible - 1], cap.squash);
      } else {
        drawStuds(ctx, top.x, topY, size, posts[i][visible - 1]);
      }
    }
    ctx.translate(-dx, 0);
  }
}

// null — крышки нет; иначе состояние падения. Пока крышка не показана,
// у столбика не рисуется ни она, ни выступ.
function capState(view, index) {
  if (!view.completed || !view.completed[index]) return null;
  if (view.capAnim && view.capAnim.post === index) return view.capAnim;
  return STATIC_CAP;
}

const STATIC_CAP = { visible: true, lift: 0, squash: 1 };

function waveOffset(view, postIndex, slot, step) {
  if (!view.wave || view.wave.post !== postIndex) return 0;
  const local = (view.wave.t - slot) / WAVE_HOP_STEPS;
  if (local <= 0 || local >= 1) return 0;
  const shape = local < 0.5 ? EASING.easeOutBack(local * 2) : (1 - local) * 2;
  return shape * step * WAVE_RISE;
}

function landingSquash(view, postIndex, slot) {
  if (!view.landing || view.landing.post !== postIndex) return 1;
  if (slot < view.landing.fromSlot) return 1;
  return view.landing.squash;
}

// Вспышка-кольцо от основания собранной стопки наружу.
function drawBurst(ctx, view) {
  if (!view.burst) return;
  const post = view.layout.posts[view.burst.post];
  const width = view.layout.cubeWidth * post.scale;
  const t = view.burst.t;
  const radius = width * (BURST_FROM + (BURST_TO - BURST_FROM) * t);
  ctx.save();
  ctx.globalAlpha = BURST_ALPHA * (1 - t);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = BURST_WIDTH;
  ctx.beginPath();
  ctx.ellipse(post.x, post.baseY, radius, radius / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Награда летит со стопки в город: связь поля и города должна быть видна,
// а не подразумеваться.
function drawFlyingReward(ctx, view) {
  const reward = view.reward;
  if (!reward || !reward.flying) return;
  drawRewardAt(ctx, reward.pending, reward.x, reward.y, reward.unit, reward.angle);
}

// Подсказка: кольцо у подставки плюс стрелка над штырём. Одного кольца
// мало — его перекрывает соседний ряд.
function drawHintMark(ctx, layout, post, pulse, isSource) {
  const size = layout.size * post.scale;
  ctx.save();
  ctx.globalAlpha = HINT_ALPHA * (0.5 + 0.5 * pulse);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([size * 0.35, size * 0.28]);
  ctx.beginPath();
  ctx.ellipse(post.x, post.baseY, size * 1.45, size * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const top = post.baseY - layout.columnHeight * post.scale - size * 0.4;
  const bob = pulse * size * 0.18;
  const w = size * 0.42;
  ctx.fillStyle = INK;
  ctx.beginPath();
  if (isSource) {
    ctx.moveTo(post.x, top - bob - w);
    ctx.lineTo(post.x + w, top - bob);
    ctx.lineTo(post.x - w, top - bob);
  } else {
    ctx.moveTo(post.x, top + bob);
    ctx.lineTo(post.x + w, top + bob - w);
    ctx.lineTo(post.x - w, top + bob - w);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHand(ctx, view) {
  const hand = view.hand;
  if (!hand) return;
  const { layout } = view;
  const post = layout.posts[hand.from];
  const size = layout.size * post.scale;
  const baseSlot = view.posts[hand.from].length - hand.count;
  const lift = hand.lift * (size * 1.5);
  // Тень поднятой группы остаётся на земле под своим столбиком и слабеет —
  // так видно, что группа в воздухе.
  drawShadow(ctx, post.x, post.baseY, baseSlot * layout.step * post.scale, size * 2, HAND_SHADOW_FADE);
  let topY = 0;
  for (let i = 0; i < hand.count; i += 1) {
    const pos = slotPosition(layout, hand.from, baseSlot + i);
    topY = pos.y - lift;
    drawCube(ctx, post.x + hand.bob, topY, size, hand.color, 1);
  }
  drawStuds(ctx, post.x + hand.bob, topY, size, hand.color);
}

function drawFlight(ctx, view) {
  const flight = view.flight;
  if (!flight) return;
  const { layout } = view;
  // Тень летящей группы остаётся на земле под ней — иначе группа
  // выглядит приклеенной к фону.
  drawShadow(ctx, flight.x, flight.groundY, Math.max(0, flight.groundY - flight.y), layout.size * 2, FLIGHT_SHADOW_FADE);
  for (let i = 0; i < flight.count; i += 1) {
    drawCube(ctx, flight.x, flight.y - i * layout.step, layout.size, flight.color, 1);
  }
  drawStuds(ctx, flight.x, flight.y - (flight.count - 1) * layout.step, layout.size, flight.color);
}
