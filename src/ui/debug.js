// Оверлей отладки: включается тройным тапом по номеру уровня.
// Нужен, чтобы настраивать композицию с телефона, где нет консоли.
// Весь код держится в этом файле — вырезается одной строкой в main.js.

const TAP_WINDOW_MS = 700;
const TAPS_TO_TOGGLE = 3;
const FPS_SMOOTHING = 0.9;

export function createDebug() {
  let root = null;
  let panel = null;
  let cityFrame = null;
  let fieldFrame = null;
  let visible = false;
  let fps = 0;
  let last = 0;
  let taps = 0;
  let firstTap = 0;

  const trigger = document.getElementById('level-number');
  if (trigger) {
    trigger.style.pointerEvents = 'auto';
    trigger.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - firstTap > TAP_WINDOW_MS) {
        firstTap = now;
        taps = 0;
      }
      taps += 1;
      if (taps >= TAPS_TO_TOGGLE) {
        taps = 0;
        toggle();
      }
    });
  }

  function build() {
    root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9';
    cityFrame = frame('rgba(59, 113, 164, 0.85)', 'город');
    fieldFrame = frame('rgba(212, 85, 63, 0.85)', 'поле');
    panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute',
      'left:8px',
      'top:64px',
      'padding:6px 8px',
      'border-radius:8px',
      'background:rgba(46, 42, 36, 0.82)',
      'color:#FBF6EC',
      'font:600 11px/1.5 ui-monospace, monospace',
      'white-space:pre'
    ].join(';');
    root.appendChild(cityFrame.box);
    root.appendChild(fieldFrame.box);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function frame(color, title) {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;border:1px dashed ${color};background:${color.replace('0.85', '0.08')}`;
    const label = document.createElement('span');
    label.textContent = title;
    label.style.cssText = `position:absolute;right:2px;top:1px;font:600 9px/1 ui-monospace, monospace;color:${color}`;
    box.appendChild(label);
    return { box, label };
  }

  function place(target, rect) {
    target.box.style.left = `${rect.x}px`;
    target.box.style.top = `${rect.y}px`;
    target.box.style.width = `${rect.width}px`;
    target.box.style.height = `${rect.height}px`;
  }

  function toggle() {
    if (!root) build();
    visible = !visible;
    root.style.display = visible ? 'block' : 'none';
  }

  return {
    isVisible() {
      return visible;
    },
    toggle,
    update(info) {
      const now = info.time;
      if (last > 0) {
        const instant = 1000 / Math.max(1, now - last);
        fps = fps === 0 ? instant : fps * FPS_SMOOTHING + instant * (1 - FPS_SMOOTHING);
      }
      last = now;
      if (!visible || !info.layout) return;
      place(cityFrame, info.layout.city);
      place(fieldFrame, info.layout.field);
      panel.textContent = [
        `fps ${fps.toFixed(0)}`,
        `экран ${Math.round(info.layout.width)}×${Math.round(info.layout.height)} dpr ${info.dpr}`,
        `кубик ${info.layout.cubeWidth.toFixed(1)} px, шаг ${info.layout.spacing.toFixed(1)}`,
        `столбиков ${info.layout.posts.length} в ${info.layout.rows} ряд(а)`,
        `уровень ${info.level}, par ${info.par}, ходов ${info.moves}`
      ].join('\n');
    }
  };
}
