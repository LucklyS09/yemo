/* 墨夜 · core utilities, icons, API and shared UI */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const PATTERNS = ['stars', 'ink', 'grid', 'mountains', 'tide', 'mist'];
const storedPattern = localStorage.getItem('ink.pattern');

export const state = {
  library: { categories: [], novels: [] },
  novel: null,
  view: 'dashboard',
  draftId: null,
  settingId: null,
  settingEditing: false,
  settingsQuery: '',
  pattern: PATTERNS.includes(storedPattern) ? storedPattern : 'stars',
  scheme: localStorage.getItem('ink.scheme') === 'light' ? 'light' : 'dark',
  accent: ['jade', 'blue', 'red', 'amber'].includes(localStorage.getItem('ink.accent'))
    ? localStorage.getItem('ink.accent')
    : 'jade',
  sidebarCollapsed: localStorage.getItem('ink.sidebarCollapsed') === '1',
  collapsed: readCollapsed(),
  search: '',
  focusEditor: false,
  save: { status: 'idle', at: null, error: null },
  booted: false,
};

export const ACCENTS = {
  jade: { name: '松烟', color: '#4fc7a6', color2: '#79d2c1', color3: '#8ea9d6' },
  blue: { name: '夜潮', color: '#5b86d6', color2: '#91a6ce', color3: '#c6d2e8' },
  red: { name: '暮紫', color: '#7a6fc4', color2: '#7e91bd', color3: '#c4c9dd' },
  amber: { name: '麦金', color: '#dcb84a', color2: '#4fbfb2', color3: '#7e97d6' },
};
export const ACCENT_ORDER = ['jade', 'blue', 'red', 'amber'];

function readCollapsed() {
  try {
    return JSON.parse(localStorage.getItem('ink.collapsed') || '{}');
  } catch {
    return {};
  }
}

export function persistCollapsed() {
  localStorage.setItem('ink.collapsed', JSON.stringify(state.collapsed));
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function debounce(fn, wait = 200) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function countWords(text) {
  const value = String(text || '');
  const cjk = (value.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (value
    .replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseAliases(value) {
  return String(value || '')
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 20);
}

export function formatNumber(value) {
  const number = Number(value) || 0;
  if (number >= 10000) {
    const unit = number / 10000;
    return `${unit >= 100 ? unit.toFixed(0) : unit.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return number.toLocaleString('zh-CN');
}

export function formatDate(value, withTime = false) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('zh-CN', options).format(date).replace(/\//g, '.');
}

export function relativeTime(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const diff = Date.now() - time;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;
  return formatDate(value);
}

export function todayLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export function hexToRgba(hex, alpha = 0.15) {
  const value = String(hex || '#ffffff').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/* ---------------------------------------------------------------- icons */

const ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  feather: '<path d="M20.2 3.8a5.5 5.5 0 0 0-7.8 0L4 12.2V20h7.8l8.4-8.4a5.5 5.5 0 0 0 0-7.8Z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 16v4M17 18h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  bold: '<path d="M6 4h7a4 4 0 0 1 0 8H6Z"/><path d="M6 12h8a4 4 0 0 1 0 8H6Z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 21h16"/>',
  strike: '<path d="M4 12h16"/><path d="M17 7a4 4 0 0 0-4-3H9a4 4 0 0 0-1 7.8"/><path d="M7 17a4 4 0 0 0 4 3h3a4 4 0 0 0 3.5-5.8"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 7.5 4.6 4.6 0 0 0 16.5 3Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="9.5" cy="6.8" r="1"/><circle cx="14" cy="6.5" r="1"/>',
  marker: '<path d="m9 11-6 6v3h3l6-6"/><path d="m14 6 4 4"/><path d="m12 8 6-6 4 4-6 6-4-4Z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  eraser: '<path d="m7 21-4-4L16 4l4 4L7 21Z"/><path d="M11 8l5 5"/><path d="M7 21h14"/>',
  focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 3 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  wave: '<path d="M3 8c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 3 3"/><path d="M3 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 3 3"/><path d="M3 20c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 3 3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  timeline: '<circle cx="6" cy="5" r="2"/><path d="M6 7v12"/><path d="M10 5h11M10 12h8M10 19h10"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="19" r="2"/>',
  columns: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3"/><path d="M7 21v-7h10v7"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  quote: '<path d="M9 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3V7Z"/><path d="M9 14c0 3-2 4-4 4"/><path d="M21 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3V7Z"/><path d="M21 14c0 3-2 4-4 4"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  library: '<path d="M4 4h5v16H4zM11 4h4v16h-4z"/><path d="m17 4 4 16"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};

export function icon(name, size = 18, cls = '') {
  const paths = ICON_PATHS[name] || ICON_PATHS.dot;
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/* --------------------------------------------------------------- covers */

export const COVERS = {
  aurora: { name: '极光', a: '#2a1b4a', b: '#744cc4', c: '#e58bbd', ink: '#f6ecff' },
  ember: { name: '余烬', a: '#3b1117', b: '#9b3a2d', c: '#e3a23e', ink: '#fff0dc' },
  jade: { name: '青玉', a: '#0b211e', b: '#1d6b5a', c: '#8ed8b0', ink: '#e8fff7' },
  abyss: { name: '深海', a: '#071523', b: '#164a70', c: '#4fc3d9', ink: '#e4fbff' },
  wine: { name: '绛夜', a: '#260b18', b: '#742140', c: '#d2708d', ink: '#ffe8ef' },
  lunar: { name: '月蚀', a: '#161620', b: '#46465e', c: '#b9b0c8', ink: '#f3eefb' },
  eclipse: { name: '日蚀', a: '#1c1022', b: '#5d2b60', c: '#dfa65d', ink: '#fff4e2' },
  ocean: { name: '潮汐', a: '#08161c', b: '#155a68', c: '#71cfc5', ink: '#e6fff9' },
};

export function coverVars(key) {
  return COVERS[key] || COVERS.jade;
}

export function coverHTML(meta, size = 'md', extra = '') {
  const cover = coverVars(meta.cover);
  const title = meta.title || '未命名';
  return `<div class="cover cover--${size} ${extra}" style="--ca:${cover.a};--cb:${cover.b};--cc:${cover.c};--cink:${cover.ink}">
    <span class="cover__glow"></span>
    <span class="cover__grain"></span>
    <span class="cover__monogram">${esc(title.slice(0, 1))}</span>
    <span class="cover__spine"></span>
    <span class="cover__meta">
      <span class="cover__kicker">INK NOCTURNE</span>
      <span class="cover__title">${esc(title)}</span>
      <span class="cover__author">${esc(meta.category || '未分类')}</span>
    </span>
  </div>`;
}

export function miniCover(meta) {
  const cover = coverVars(meta.cover);
  return `<span class="mini-cover" style="--ca:${cover.a};--cb:${cover.b};--cc:${cover.c};--cink:${cover.ink}">
    <span>${esc((meta.title || '书').slice(0, 1))}</span>
  </span>`;
}

/* ------------------------------------------------------------ vocabulary */

export const KINDS = {
  人物: { color: '#f472b6', glyph: '人' },
  地点: { color: '#67e8f9', glyph: '地' },
  物品: { color: '#fbbf24', glyph: '物' },
  组织: { color: '#c4b5fd', glyph: '势' },
  概念: { color: '#86efac', glyph: '念' },
  设定: { color: '#a8a3b3', glyph: '设' },
};
export const KIND_NAMES = Object.keys(KINDS);

export const TERM_PALETTE = [
  '#f5c97b', '#f472b6', '#67e8f9', '#86efac', '#a78bfa', '#fbbf24',
  '#fb7185', '#38bdf8', '#c4b5fd', '#f9a8d4', '#fde68a', '#5eead4',
];

export const TEXT_COLORS = [
  '#f2ede4', '#f5c97b', '#f472b6', '#fb7185', '#fbbf24', '#86efac',
  '#67e8f9', '#60a5fa', '#a78bfa', '#c4b5fd', '#f9a8d4', '#8f8a99',
];

export const HIGHLIGHT_COLORS = [
  '#3d2b56', '#4a2038', '#173c46', '#1c3b2e', '#4a3518', '#2c2f45',
];

/* -------------------------------------------------------------- outlines */

export const OUTLINE_TEMPLATES = [
  {
    id: 'three',
    name: '三幕式',
    label: '经典叙事',
    icon: 'columns',
    layout: 'columns',
    columns: [
      { id: 'act1', name: '第一幕', sub: '建置', color: '#67e8f9' },
      { id: 'act2', name: '第二幕', sub: '对抗', color: '#f472b6' },
      { id: 'act3', name: '第三幕', sub: '解决', color: '#a78bfa' },
    ],
    starters: [
      { stage: 'act1', title: '开场：日常与裂缝', summary: '' },
      { stage: 'act1', title: '转折：意外闯入', summary: '' },
      { stage: 'act2', title: '升级：第一次交手', summary: '' },
      { stage: 'act2', title: '低谷：失去与代价', summary: '' },
      { stage: 'act3', title: '高潮：正面交锋', summary: '' },
      { stage: 'act3', title: '收束：新的日常', summary: '' },
    ],
  },
  {
    id: 'four',
    name: '起承转合',
    label: '四拍节奏',
    icon: 'timeline',
    layout: 'columns',
    columns: [
      { id: 'qi', name: '起', sub: '引入', color: '#86efac' },
      { id: 'cheng', name: '承', sub: '展开', color: '#67e8f9' },
      { id: 'zhuan', name: '转', sub: '突变', color: '#f472b6' },
      { id: 'he', name: '合', sub: '收束', color: '#f5c97b' },
    ],
    starters: [
      { stage: 'qi', title: '起：故事从哪一刻开始', summary: '' },
      { stage: 'cheng', title: '承：关系与局势展开', summary: '' },
      { stage: 'zhuan', title: '转：意料之外的真相', summary: '' },
      { stage: 'he', title: '合：尘埃落定之后', summary: '' },
    ],
  },
  {
    id: 'timeline',
    name: '时间线',
    label: '顺流而下',
    icon: 'timeline',
    layout: 'timeline',
    columns: [
      { id: 'prologue', name: '序章', sub: '引子', color: '#8f8a99' },
      { id: 'rise', name: '开端', sub: '起势', color: '#67e8f9' },
      { id: 'develop', name: '发展', sub: '推进', color: '#86efac' },
      { id: 'peak', name: '高潮', sub: '爆发', color: '#f472b6' },
      { id: 'ending', name: '结局', sub: '余韵', color: '#f5c97b' },
    ],
    starters: [
      { stage: 'prologue', title: '序章：一个旧传说', summary: '' },
      { stage: 'rise', title: '开端：主角的日常被打破', summary: '' },
      { stage: 'develop', title: '发展：追寻与试探', summary: '' },
      { stage: 'peak', title: '高潮：真相与抉择', summary: '' },
      { stage: 'ending', title: '结局：留下的与失去的', summary: '' },
    ],
  },
  {
    id: 'free',
    name: '自由卡片',
    label: '灵感优先',
    icon: 'grid',
    layout: 'grid',
    columns: [
      { id: 'spark', name: '灵感', sub: '火花', color: '#f5c97b' },
      { id: 'build', name: '推进', sub: '行动', color: '#67e8f9' },
      { id: 'clash', name: '冲突', sub: '对撞', color: '#f472b6' },
      { id: 'echo', name: '余韵', sub: '回响', color: '#a78bfa' },
    ],
    starters: [
      { stage: 'spark', title: '一个放不下的画面', summary: '' },
      { stage: 'build', title: '人物开始行动', summary: '' },
      { stage: 'clash', title: '最不愿面对的事', summary: '' },
      { stage: 'echo', title: '故事留下的那点余温', summary: '' },
    ],
  },
];

export function getTemplate(id) {
  return OUTLINE_TEMPLATES.find((item) => item.id === id) || OUTLINE_TEMPLATES[0];
}

export function stageInfo(templateId, stageId) {
  const template = getTemplate(templateId);
  return template.columns.find((column) => column.id === stageId) || {
    id: stageId || 'unassigned',
    name: '未分幕',
    sub: '',
    color: '#8f8a99',
  };
}

export function termEntries(entries) {
  return (entries || []).filter((entry) => entry.term !== false && entry.color && entry.title?.trim());
}

/* ------------------------------------------------------------------ API */

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败（${response.status}）`);
  }
  return payload;
}

export const api = {
  library: () => request('/api/library'),
  novel: (id) => request(`/api/novels/${encodeURIComponent(id)}`),
  createNovel: (data) =>
    request('/api/novels', { method: 'POST', body: JSON.stringify(data) }),
  updateMeta: (id, data) =>
    request(`/api/novels/${encodeURIComponent(id)}/meta`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  saveOutline: (id, data) =>
    request(`/api/novels/${encodeURIComponent(id)}/outline`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  saveSettings: (id, data) =>
    request(`/api/novels/${encodeURIComponent(id)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  createDraft: (id, data) =>
    request(`/api/novels/${encodeURIComponent(id)}/drafts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDraft: (id, draftId, data) =>
    request(`/api/novels/${encodeURIComponent(id)}/drafts/${encodeURIComponent(draftId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDraft: (id, draftId) =>
    request(`/api/novels/${encodeURIComponent(id)}/drafts/${encodeURIComponent(draftId)}`, {
      method: 'DELETE',
    }),
  deleteNovel: (id) =>
    request(`/api/novels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  history: (id) => request(`/api/novels/${encodeURIComponent(id)}/history`),
  createHistory: (id, reason = '手动快照') =>
    request(`/api/novels/${encodeURIComponent(id)}/history`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  historySnapshot: (id, snapshotId) =>
    request(
      `/api/novels/${encodeURIComponent(id)}/history/${encodeURIComponent(snapshotId)}`,
    ),
  restoreHistory: (id, snapshotId, data) =>
    request(
      `/api/novels/${encodeURIComponent(id)}/history/${encodeURIComponent(snapshotId)}`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  trash: () => request('/api/trash'),
  restoreTrash: (trashId) =>
    request(`/api/trash/${encodeURIComponent(trashId)}`, { method: 'POST' }),
  purgeTrash: (trashId) =>
    request(`/api/trash/${encodeURIComponent(trashId)}`, { method: 'DELETE' }),
  reveal: (id) =>
    request(`/api/novels/${encodeURIComponent(id)}/reveal`, { method: 'POST' }),
  exportUrl: (id, format = 'md') =>
    `/api/novels/${encodeURIComponent(id)}/export?format=${format}`,
};

/* -------------------------------------------------------------- popovers */

let activePopover = null;

export function closePopover() {
  if (!activePopover) return;
  const { element, cleanup } = activePopover;
  activePopover = null;
  cleanup?.();
  element.classList.remove('is-open');
  setTimeout(() => element.remove(), 120);
}

export function showPopover(anchor, html, options = {}) {
  closePopover();
  const root = $('#popoverRoot');
  const element = document.createElement('div');
  element.className = `popover ${options.className || ''}`;
  element.innerHTML = html;
  root.appendChild(element);

  const rect = anchor.getBoundingClientRect();
  const width = options.width || 230;
  let left = options.align === 'left' ? rect.left : rect.right - width;
  left = clamp(left, 12, window.innerWidth - width - 12);
  let top = rect.bottom + 8;
  const height = element.offsetHeight;
  if (top + height > window.innerHeight - 12) top = rect.top - height - 8;
  element.style.width = `${width}px`;
  element.style.left = `${left}px`;
  element.style.top = `${Math.max(12, top)}px`;

  const onPointer = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) closePopover();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') closePopover();
  };
  const onScroll = () => closePopover();
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
  }, 0);
  document.addEventListener('keydown', onKey);
  const cleanup = () => {
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll, true);
  };
  activePopover = { element, cleanup };
  requestAnimationFrame(() => element.classList.add('is-open'));
  options.onMount?.(element, closePopover);
  return { element, close: closePopover };
}

/* ---------------------------------------------------------------- modals */

let modalToken = 0;

export function openModal({ title, eyebrow, body, footer = '', size = 'md', onMount, onClose }) {
  const root = $('#modalRoot');
  const token = ++modalToken;
  root.innerHTML = `<div class="modal-backdrop">
    <section class="modal modal--${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__glow"></div>
      <header class="modal__head">
        <div>
          ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
          <h2 class="modal__title">${esc(title)}</h2>
        </div>
        <button class="icon-btn modal__close" type="button" aria-label="关闭">${icon('x', 18)}</button>
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__footer">${footer}</footer>` : ''}
    </section>
  </div>`;
  document.body.classList.add('modal-open');
  const backdrop = $('.modal-backdrop', root);
  const panel = $('.modal', root);
  let closed = false;
  const close = () => {
    if (closed || token !== modalToken) return;
    closed = true;
    onClose?.();
    document.body.classList.remove('modal-open');
    backdrop.classList.remove('is-open');
    panel.classList.add('is-closing');
    setTimeout(() => {
      if (token === modalToken) root.innerHTML = '';
    }, 180);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });
  $('.modal__close', panel)?.addEventListener('click', close);
  $$('[data-close]', panel).forEach((button) => button.addEventListener('click', close));
  onMount?.(panel, close);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  setTimeout(() => {
    const focus = panel.querySelector('[autofocus], input:not([type="hidden"]), textarea, select, button.primary-btn');
    focus?.focus();
    if (focus instanceof HTMLInputElement && focus.dataset.select === 'true') focus.select();
  }, 60);
  return { close, panel };
}

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  eyebrow = 'PLEASE CONFIRM',
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };
    const modal = openModal({
      title,
      eyebrow,
      size: 'sm',
      body: `<p class="confirm-message">${esc(message)}</p>`,
      footer: `<button class="ghost-btn" type="button" data-cancel>${esc(cancelText)}</button>
        <button class="${danger ? 'danger-btn' : 'primary-btn'}" type="button" data-confirm>${esc(confirmText)}</button>`,
      onMount(panel) {
        $('[data-confirm]', panel).addEventListener('click', () => finish(true));
        $('[data-cancel]', panel).addEventListener('click', () => finish(false));
        panel.closest('.modal-backdrop').addEventListener('mousedown', (event) => {
          if (event.target === event.currentTarget) finish(false);
        });
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

/* ---------------------------------------------------------------- toasts */

export function toast(message, type = 'success', iconName) {
  const root = $('#toastRoot');
  const text = String(message);
  root.querySelectorAll('.toast').forEach((item) => {
    if (item.dataset.message === text) item.remove();
  });
  while (root.children.length >= 3) root.firstElementChild.remove();
  const item = document.createElement('div');
  item.className = `toast toast--${type}`;
  item.dataset.message = text;
  const glyph = iconName || (type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check');
  item.innerHTML = `<span class="toast__icon">${icon(glyph, 16)}</span><span>${esc(message)}</span>`;
  root.appendChild(item);
  requestAnimationFrame(() => item.classList.add('is-open'));
  setTimeout(() => {
    item.classList.remove('is-open');
    setTimeout(() => item.remove(), 260);
  }, type === 'error' ? 4200 : 2800);
}

/* --------------------------------------------------------------- helpers */

export function setThemePattern(pattern) {
  state.pattern = PATTERNS.includes(pattern) ? pattern : 'stars';
  localStorage.setItem('ink.pattern', state.pattern);
  document.body.dataset.pattern = state.pattern;
  $$('[data-pattern]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.pattern === state.pattern);
  });
}

export function applyAppearance() {
  document.documentElement.dataset.scheme = state.scheme;
  document.documentElement.dataset.accent = state.accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.scheme === 'light' ? '#f3f0e8' : '#0e1118');
  $$('[data-scheme-choice]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.schemeChoice === state.scheme);
  });
  $$('[data-accent-choice]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.accentChoice === state.accent);
  });
  document.dispatchEvent(new CustomEvent('ink:appearance'));
}

export function setScheme(scheme) {
  state.scheme = scheme === 'light' ? 'light' : 'dark';
  localStorage.setItem('ink.scheme', state.scheme);
  applyAppearance();
}

export function setAccent(accent) {
  state.accent = ['jade', 'blue', 'red', 'amber'].includes(accent) ? accent : 'jade';
  localStorage.setItem('ink.accent', state.accent);
  applyAppearance();
}

export function readLastNovel() {
  return localStorage.getItem('ink.lastNovel') || '';
}

export function rememberNovel(id) {
  localStorage.setItem('ink.lastNovel', id || '');
}
