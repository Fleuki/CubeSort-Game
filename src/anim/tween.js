// Твин-движок. Объекты переиспользуются из пула: в цикле отрисовки
// нельзя создавать мусор, иначе на бюджетном Android ловим сборки GC.

const POOL_LIMIT = 64;

export const EASING = {
  linear: (t) => t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
};

// prefers-reduced-motion сокращает все длительности до 40%.
let timeScale = 1;

export function setTimeScale(scale) {
  timeScale = scale;
}

export function getTimeScale() {
  return timeScale;
}

export function createTweenPool() {
  return { active: [], free: [] };
}

export function addTween(pool, options) {
  const tween = pool.free.pop() || {};
  tween.time = 0;
  tween.duration = Math.max(1, options.duration * timeScale);
  tween.easing = options.easing || EASING.linear;
  tween.onUpdate = options.onUpdate || null;
  tween.onDone = options.onDone || null;
  tween.dead = false;
  pool.active.push(tween);
  if (tween.onUpdate) tween.onUpdate(0);
  return tween;
}

export function updateTweens(pool, dt) {
  const active = pool.active;
  let write = 0;
  for (let i = 0; i < active.length; i += 1) {
    const tween = active[i];
    if (tween.dead) {
      recycle(pool, tween);
      continue;
    }
    tween.time += dt;
    const raw = Math.min(1, tween.time / tween.duration);
    if (tween.onUpdate) tween.onUpdate(tween.easing(raw));
    if (raw >= 1) {
      const done = tween.onDone;
      tween.dead = true;
      recycle(pool, tween);
      if (done) done();
      continue;
    }
    active[write] = tween;
    write += 1;
  }
  active.length = write;
}

function recycle(pool, tween) {
  tween.onUpdate = null;
  tween.onDone = null;
  if (pool.free.length < POOL_LIMIT) pool.free.push(tween);
}

export function clearTweens(pool) {
  for (let i = 0; i < pool.active.length; i += 1) pool.active[i].dead = true;
  pool.active.length = 0;
}

export function isBusy(pool) {
  return pool.active.length > 0;
}
