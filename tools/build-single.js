// Сборка одного HTML-файла для превью и раздачи ссылкой.
// Игре она не нужна: index.html работает с обычными ES-модулями.
// Здесь модули склеиваются в один скрипт, а шрифты — в data-URI,
// чтобы страница жила без единого внешнего запроса.
//
//   node tools/build-single.js  →  dist/game.html

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Порядок важен: модуль должен идти после всех, кого импортирует.
const MODULES = [
  'levels/levels-easy.js',
  'levels/levels-normal.js',
  'levels/levels-hard.js',
  'src/game/modes.js',
  'src/game/state.js',
  'src/game/rules.js',
  'src/game/solver.js',
  'src/game/generator.js',
  'src/game/history.js',
  'src/render/shadow.js',
  'src/render/iso.js',
  'src/render/scale.js',
  'src/render/layout.js',
  'src/render/city.js',
  'src/anim/tween.js',
  'src/anim/fx.js',
  'src/render/scene.js',
  'src/audio/sfx.js',
  'src/ui/hud.js',
  'src/ui/screens.js',
  'src/ui/debug.js',
  'src/platform/none.js',
  'src/platform/yandex.js',
  'src/platform/playgama.js',
  'src/platform/sdk.js',
  'src/main.js'
];

const FONTS = [
  'assets/fonts/Unbounded-700-cyrillic.woff2',
  'assets/fonts/Unbounded-700-latin.woff2',
  'assets/fonts/Onest-cyrillic.woff2',
  'assets/fonts/Onest-latin.woff2'
];

function namespaceOf(path) {
  return `__${path.replace(/[^a-z0-9]/gi, '_')}`;
}

function resolveImport(fromPath, spec) {
  const parts = join(dirname(fromPath), spec).split('/');
  return parts.join('/');
}

function transform(path, source) {
  const exported = new Set();
  let code = source;

  code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';$/gm, (match, names, spec) => {
    const ns = namespaceOf(resolveImport(path, spec));
    return `const {${names.replace(/\s+as\s+/g, ': ')}} = ${ns};`;
  });
  code = code.replace(/^import\s*\*\s*as\s*(\w+)\s*from\s*'([^']+)';$/gm, (match, name, spec) => {
    return `const ${name} = ${namespaceOf(resolveImport(path, spec))};`;
  });

  code = code.replace(/^export\s+(async\s+function|function|const|let|class)\s+(\w+)/gm, (match, kind, name) => {
    exported.add(name);
    return `${kind} ${name}`;
  });
  code = code.replace(/^export\s*\{([^}]+)\};$/gm, (match, names) => {
    names.split(',').forEach((name) => exported.add(name.trim().split(/\s+as\s+/).pop()));
    return '';
  });

  const returned = Array.from(exported).join(', ');
  return `const ${namespaceOf(path)} = (() => {\n${code}\nreturn { ${returned} };\n})();`;
}

function build() {
  const chunks = MODULES.map((path) => transform(path, readFileSync(join(ROOT, path), 'utf8')));
  let css = readFileSync(join(ROOT, 'style.css'), 'utf8');
  FONTS.forEach((font) => {
    const base64 = readFileSync(join(ROOT, font)).toString('base64');
    css = css.replaceAll(`url('${font}')`, `url('data:font/woff2;base64,${base64}')`);
  });

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
    .replace('<script type="module" src="src/main.js"></script>', `<script type="module">\n${chunks.join('\n')}\n</script>`);

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/game.html'), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  process.stdout.write(`dist/game.html — ${kb} КБ\n`);
}

build();
