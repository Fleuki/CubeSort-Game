// Отрисовка кадра целиком. Модуль только читает view — состояние
// игры он не меняет.

import { drawCube, drawPost, drawShadowEllipse, SKY_TOP, TABLE, INK, shade } from './iso.js';
import { getCityCanvas } from './city.js';
import { slotPosition } from './layout.js';
import { drawParticles } from '../anim/fx.js';

const HINT_ALPHA = 0.9;
const WAVE_HEIGHT = 0.5;
const WAVE_SPAN = 0.45;

export function drawScene(ctx, view) {
  const { layout, fx } = view;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawBackground(ctx, layout);

  ctx.translate(fx.shakeX, fx.shakeY);
  drawCity(ctx, view);
  drawPosts(ctx, view);
  drawHand(ctx, view);
  drawFlight(ctx, view);
  drawParticles(ctx, fx);
  ctx.translate(-fx.shakeX, -fx.shakeY);
  if (view.fade > 0) {
    ctx.globalAlpha = view.fade;
    ctx.fillStyle = SKY_TOP;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }
}

function drawBackground(ctx, layout) {
  const gradient = ctx.createLinearGradient(0, 0, 0, layout.height);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(0.55, TABLE);
  gradient.addColorStop(1, shade(TABLE, -0.08));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

function drawCity(ctx, view) {
  const rect = view.layout.city;
  drawTablePlate(ctx, rect);
  const canvas = getCityCanvas(view.city, rect);
  ctx.drawImage(canvas, rect.x, rect.y);
  if (view.cityAppear) {
    view.cityAppear.draw(ctx, rect);
  }
  // Линия стола под макетом: отделяет «сцену» от поля.
  ctx.strokeStyle = 'rgba(92, 70, 44, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rect.height);
  ctx.lineTo(view.layout.width, rect.height);
  ctx.stroke();
}

// Плита стола: макет должен стоять на поверхности, а не висеть в воздухе.
function drawTablePlate(ctx, rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height * 0.62;
  ctx.fillStyle = 'rgba(154, 123, 82, 0.10)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rect.width * 0.46, rect.height * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, cy - rect.height * 0.02, rect.width * 0.44, rect.height * 0.31, 0, 0, Math.PI * 2);
  ctx.fill();
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
    ctx.translate(dx, 0);
    drawPost(ctx, post.x, post.baseY, layout.stackHeight + layout.size * 0.35, layout.size);
    if (view.hint && (view.hint.from === i || view.hint.to === i)) {
      drawHintMark(ctx, layout, post, view.hintPulse, view.hint.from === i);
    }
    // Кубики, поднятые в руку или летящие, со штыря убираются —
    // иначе группа рисуется дважды.
    let hiddenTop = view.hidden && view.hidden.post === i ? view.hidden.count : 0;
    if (view.hand && view.hand.from === i) hiddenTop += view.hand.count;
    const visible = posts[i].length - hiddenTop;
    for (let slot = 0; slot < visible; slot += 1) {
      const pos = slotPosition(layout, i, slot);
      const wave = waveOffset(view, i, slot, layout.size);
      const squash = landingSquash(view, i, slot);
      drawCube(ctx, pos.x, pos.y - wave, layout.size, posts[i][slot], squash);
    }
    ctx.translate(-dx, 0);
  }
}

function waveOffset(view, postIndex, slot, size) {
  if (!view.wave || view.wave.post !== postIndex) return 0;
  const local = view.wave.t - slot * WAVE_SPAN;
  if (local <= 0 || local >= 1) return 0;
  return Math.sin(local * Math.PI) * size * WAVE_HEIGHT;
}

function landingSquash(view, postIndex, slot) {
  if (!view.landing || view.landing.post !== postIndex) return 1;
  if (slot < view.landing.fromSlot) return 1;
  return view.landing.squash;
}

// Подсказка: кольцо у подставки плюс стрелка над штырём. Одного кольца
// мало — его перекрывает соседний ряд.
function drawHintMark(ctx, layout, post, pulse, isSource) {
  const size = layout.size;
  ctx.save();
  ctx.globalAlpha = HINT_ALPHA * (0.5 + 0.5 * pulse);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([size * 0.35, size * 0.28]);
  ctx.beginPath();
  ctx.ellipse(post.x, post.baseY, size * 1.45, size * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const top = post.baseY - layout.stackHeight - size * 0.55;
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
  const baseSlot = view.posts[hand.from].length - hand.count;
  const lift = hand.lift * (layout.size * 1.5);
  for (let i = 0; i < hand.count; i += 1) {
    const pos = slotPosition(layout, hand.from, baseSlot + i);
    drawCube(ctx, post.x + hand.bob, pos.y - lift, layout.size, hand.color, 1);
  }
}

function drawFlight(ctx, view) {
  const flight = view.flight;
  if (!flight) return;
  const { layout } = view;
  for (let i = 0; i < flight.count; i += 1) {
    drawCube(ctx, flight.x, flight.y - i * layout.step, layout.size, flight.color, 1);
  }
  drawShadowEllipse(ctx, flight.x, flight.groundY, layout.size * 0.9, layout.size * 0.4, 0.35);
}
