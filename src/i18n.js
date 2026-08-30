// Словари и выбор языка. Модуль не трогает DOM и не ходит в сеть:
// переводы лежат прямо здесь, потому что порталы запрещают догружать
// файлы локализации по сети. Русский — основной, английский — для
// зарубежных площадок Playgama.

const STORAGE_KEY = 'cubesort.lang';
export const LANGS = ['ru', 'en'];
export const FALLBACK_LANG = 'en';
const DEFAULT_LANG = 'ru';

// Название не переводится, а транслитерируется: русская локаль и материалы
// Яндекс.Игр — строго «Кубоград», международные площадки — «Kubograd».
// Синонимы-переводы запрещены, подробности в GAME_NAME.md.

export const DICT = {
  ru: {
    'app.title': 'Кубоград',

    'hud.menu': 'Меню',
    'hud.settings': 'Настройки',
    'hud.level': 'Уровень',
    'hud.moves': 'Ходов {n}',
    'hud.undo': 'Отменить',
    'hud.hint': 'Подсказка',
    'hud.post': 'Столбик',

    'menu.note': 'В каждом режиме свой город',
    'menu.settings': 'Настройки',
    'menu.progress': 'Уровень {n} / {total}',
    'menu.notStarted': '{note} · не начат',

    'mode.easy.title': 'Лёгкий',
    'mode.easy.note': 'Три цвета, много места',
    'mode.normal.title': 'Средний',
    'mode.normal.note': 'Ровный подъём до семи цветов',
    'mode.hard.title': 'Сложный',
    'mode.hard.note': 'Семь цветов, один запасной столбик',

    'result.title': 'Уровень пройден',
    'result.moves': 'Ходов: {n}',
    'result.city': 'Домов в городе: {n}',
    'result.next': 'Далее',

    'settings.title': 'Настройки',
    'settings.restart': 'Начать уровень заново',
    'settings.sound': 'Звук',
    'settings.vibro': 'Вибрация',
    'settings.language': 'Язык',
    'settings.reset': 'Сбросить прогресс',
    'settings.close': 'Закрыть',
    'settings.on': 'вкл',
    'settings.off': 'выкл',

    'toast.hintStuck': 'Отсюда подсказка не поможет — попробуй отменить ход',
    'toast.rewardFailed': 'Награда не получена'
  },
  en: {
    'app.title': 'Kubograd',

    'hud.menu': 'Menu',
    'hud.settings': 'Settings',
    'hud.level': 'Level',
    'hud.moves': 'Moves: {n}',
    'hud.undo': 'Undo',
    'hud.hint': 'Hint',
    'hud.post': 'Column',

    'menu.note': 'Every mode grows its own city',
    'menu.settings': 'Settings',
    'menu.progress': 'Level {n} / {total}',
    'menu.notStarted': '{note} · New',

    'mode.easy.title': 'Easy',
    'mode.easy.note': 'Three colors, plenty of room',
    'mode.normal.title': 'Normal',
    'mode.normal.note': 'A steady climb to seven colors',
    'mode.hard.title': 'Hard',
    'mode.hard.note': 'Seven colors, one spare column',

    'result.title': 'Level complete',
    'result.moves': 'Moves: {n}',
    'result.city': 'Houses in the city: {n}',
    'result.next': 'Next',

    'settings.title': 'Settings',
    'settings.restart': 'Restart level',
    'settings.sound': 'Sound',
    'settings.vibro': 'Vibration',
    'settings.language': 'Language',
    'settings.reset': 'Reset progress',
    'settings.close': 'Close',
    'settings.on': 'on',
    'settings.off': 'off',

    'toast.hintStuck': 'No hint from here — try undoing a move',
    'toast.rewardFailed': 'No reward this time'
  }
};

// Предупреждать о забытом ключе имеет смысл только разработчику:
// на площадке это мусор в консоли, за который снимают с модерации.
const DEV = isDev();

let current = DEFAULT_LANG;
const listeners = [];

function isDev() {
  try {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  } catch (error) {
    return false;
  }
}

function normalize(lang) {
  if (typeof lang !== 'string') return '';
  const short = lang.toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(short) ? short : '';
}

function readStored() {
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    // Приватный режим Safari режет localStorage — язык просто определим заново.
    return '';
  }
}

function writeStored(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (error) {
    // Выбор не переживёт перезагрузку, но игру это не ломает.
  }
}

function readNavigator() {
  try {
    const list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (let i = 0; i < list.length; i += 1) {
      const lang = normalize(list[i]);
      if (lang) return lang;
    }
  } catch (error) {
    // Нет navigator — уйдём в фолбэк.
  }
  return '';
}

// Порядок из задачи: выбор игрока → язык площадки → язык браузера → фолбэк.
export function detectLanguage(platformLang) {
  return readStored() || normalize(platformLang) || readNavigator() || FALLBACK_LANG;
}

// Первичная установка: язык площадки не запоминаем в localStorage,
// иначе игрок навсегда получит то, что отдал портал в первый заход.
export function initLanguage(platformLang) {
  current = detectLanguage(platformLang);
  notify();
  return current;
}

export function getLanguage() {
  return current;
}

// Явный выбор игрока — его и сохраняем.
export function setLanguage(lang) {
  const next = normalize(lang);
  if (!next || next === current) return current;
  current = next;
  writeStored(next);
  notify();
  return current;
}

export function onLanguageChange(listener) {
  listeners.push(listener);
}

function notify() {
  for (let i = 0; i < listeners.length; i += 1) listeners[i](current);
}

export function t(key, params) {
  const table = DICT[current] || DICT[FALLBACK_LANG];
  let text = table[key];
  if (text === undefined) text = DICT[FALLBACK_LANG][key];
  if (text === undefined) {
    if (DEV) console.warn(`[i18n] нет ключа: ${key}`);
    return key;
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] === undefined ? match : String(params[name])
  ));
}
