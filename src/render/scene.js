// Отрисовка кадра целиком. Модуль только читает view — состояние
// игры он не меняет.

import { drawCube, drawPostBase, drawHole, drawPegStub, drawGhostSlot, SKY_TOP, TABLE, INK, shade } from './iso.js';
import { drawShadow } from './shadow.js';
import { getCityCanvas } from './city.js';
import { slotPosition } from './layout.js';
import { drawParticles } from '../anim/fx.js';

const HINT_ALPHA = 0.9;
const WAVE_HEIGHT = 0.5;
const WAVE_SPAN = 0.45;
const HAND_SHADOW_FADE = 0.45;
const FLIGHT_SHADOW_FADE = 0.7;
const GHOST_FADE_STEP = 0.78;
const GHOST_FADE_MIN = 0.4;

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
  const canvas = getCityCanvas(view.city, rect);
  ctx.drawImage(canvas, rect.x, rect.y);
  if (view.cityAppear) {
    view.cityAppear.draw(ctx, rect);
  }
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
    ctx.translate(dx, 0);
    drawPostBase(ctx, post.x, post.baseY, size);
    if (view.hint && (view.hint.from === i || view.hint.to === i)) {
      drawHintMark(ctx, layout, post, view.hintPulse, view.hint.from === i);
    }
    // Кубики, поднятые в руку или летящие, со штыря убираются —
    // иначе группа рисуется дважды.
    let hiddenTop = view.hidden && view.hidden.post === i ? view.hidden.count : 0;
    if (view.hand && view.hand.from === i) hiddenTop += view.hand.count;
    const visible = posts[i].length - hiddenTop;
    if (visible > 0) {
      // Тень всей стопки: чем она выше, тем длиннее, мягче и бледнее.
      drawShadow(ctx, post.x, post.baseY, visible * step + size * 0.5, size * 2, 1, post.scale);
    }
    for (let slot = 0; slot < visible; slot += 1) {
      const pos = slotPosition(layout, i, slot);
      const wave = waveOffset(view, i, slot, size);
      const squash = landingSquash(view, i, slot);
      drawCube(ctx, pos.x, pos.y - wave, size, posts[i][slot], squash);
    }
    const topY = visible > 0
      ? slotPosition(layout, i, visible - 1).y - waveOffset(view, i, visible - 1, size)
      : post.baseY - size * 0.25;
    if (visible > 0) drawHole(ctx, post.x, topY, size, posts[i][visible - 1]);
    drawPegStub(ctx, post.x, topY, size);
    // Свободные места показываются контурами, а не длиной штыря.
    // Ближний свободный слот — самый заметный: именно туда сядет группа.
    for (let slot = visible; slot < layout.capacity; slot += 1) {
      const pos = slotPosition(layout, i, slot);
      drawGhostSlot(ctx, pos.x, pos.y, size, Math.max(GHOST_FADE_MIN, GHOST_FADE_STEP ** (slot - visible)));
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

  const top = post.baseY - layout.pegHeight * post.scale - size * 0.75;
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
  // Тень группы остаётся на земле и слабеет по мере подъёма — так видно,
  // что группа в воздухе.
  const airborne = 1 - hand.lift * HAND_SHADOW_FADE;
  drawShadow(ctx, post.x, post.baseY, baseSlot * layout.step * post.scale + size, size * 2, airborne, airborne * post.scale);
  let topY = 0;
  for (let i = 0; i < hand.count; i += 1) {
    const pos = slotPosition(layout, hand.from, baseSlot + i);
    topY = pos.y - lift;
    drawCube(ctx, post.x + hand.bob, topY, size, hand.color, 1);
  }
  drawHole(ctx, post.x + hand.bob, topY, size, hand.color);
}

function drawFlight(ctx, view) {
  const flight = view.flight;
  if (!flight) return;
  const { layout } = view;
  // Тень летящей группы остаётся на земле под ней — иначе группа
  // выглядит приклеенной к фону.
  const height = Math.max(0, flight.groundY - flight.y);
  drawShadow(ctx, flight.x, flight.groundY, height, layout.size * 2, FLIGHT_SHADOW_FADE);
  for (let i = 0; i < flight.count; i += 1) {
    drawCube(ctx, flight.x, flight.y - i * layout.step, layout.size, flight.color, 1);
  }
  drawHole(ctx, flight.x, flight.y - (flight.count - 1) * layout.step, layout.size, flight.color);
}
