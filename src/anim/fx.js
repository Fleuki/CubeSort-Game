// Частицы-щепки и тряска камеры. Пулы фиксированного размера,
// в кадре ничего не аллоцируется.

const PARTICLE_LIMIT = 120;
const PARTICLE_LIFE = 400;
const PARTICLE_COUNT = 6;
const GRAVITY = 0.0016;
const SHAKE_DURATION = 180;
const SHAKE_AMPLITUDE = 4;

export function createFx() {
  const particles = new Array(PARTICLE_LIMIT);
  for (let i = 0; i < PARTICLE_LIMIT; i += 1) {
    particles[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0, color: '#000', spin: 0, angle: 0 };
  }
  return { particles, next: 0, shake: 0, shakeTime: 0, shakeX: 0, shakeY: 0, reducedMotion: false };
}

// count и life задаются вызывающим: на посадке щепок шесть, на сборке
// столбика — восемь и живут они дольше.
export function spawnSplinters(fx, x, y, color, count = PARTICLE_COUNT, life = PARTICLE_LIFE) {
  for (let i = 0; i < count; i += 1) {
    const particle = fx.particles[fx.next];
    fx.next = (fx.next + 1) % PARTICLE_LIMIT;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 0.05 + Math.random() * 0.09;
    particle.alive = true;
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = -Math.abs(Math.sin(angle)) * speed - 0.05;
    particle.life = life;
    particle.maxLife = life;
    particle.size = 2 + Math.random() * 2.5;
    particle.color = color;
    particle.angle = Math.random() * Math.PI;
    particle.spin = (Math.random() - 0.5) * 0.01;
  }
}

export function shakeCamera(fx, amplitude = SHAKE_AMPLITUDE, duration = SHAKE_DURATION) {
  if (fx.reducedMotion) return;
  fx.shake = amplitude;
  fx.shakeTime = duration;
  fx.shakeDuration = duration;
}

export function updateFx(fx, dt) {
  for (let i = 0; i < fx.particles.length; i += 1) {
    const particle = fx.particles[i];
    if (!particle.alive) continue;
    particle.life -= dt;
    if (particle.life <= 0) {
      particle.alive = false;
      continue;
    }
    particle.vy += GRAVITY * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.angle += particle.spin * dt;
  }
  if (fx.shakeTime > 0) {
    fx.shakeTime -= dt;
    const k = Math.max(0, fx.shakeTime / fx.shakeDuration);
    fx.shakeX = (Math.random() * 2 - 1) * fx.shake * k;
    fx.shakeY = (Math.random() * 2 - 1) * fx.shake * k;
  } else {
    fx.shakeX = 0;
    fx.shakeY = 0;
  }
}

export function drawParticles(ctx, fx) {
  for (let i = 0; i < fx.particles.length; i += 1) {
    const particle = fx.particles[i];
    if (!particle.alive) continue;
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle);
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.7);
    ctx.rotate(-particle.angle);
    ctx.translate(-particle.x, -particle.y);
  }
  ctx.globalAlpha = 1;
}
