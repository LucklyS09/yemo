/* 墨夜 · application shell / routing / library / modals */

import {
  $,
  state,
  esc,
  icon,
  api,
  miniCover,
  COVERS,
  TERM_PALETTE,
  formatNumber,
  setThemePattern,
  applyAppearance,
  setScheme,
  setAccent,
  ACCENTS,
  ACCENT_ORDER,
  persistCollapsed,
  readLastNovel,
  rememberNovel,
  toast,
  confirmDialog,
  openModal,
  showPopover,
  closePopover,
  clamp,
} from './core.js';
import {
  flushSaves,
  queueSave,
  onSaveChange,
  setActiveNovel,
  hasPendingSaves,
} from './store.js';
import { openHistory, openTrash } from './data-tools.js';
import { openSearch } from './search.js';
import { render as dashboardView } from './views/dashboard.js';
import { render as outlineView } from './views/outline.js';
import { render as settingsView } from './views/settings.js';
import { render as draftsView } from './views/drafts.js';
import { render as welcomeView } from './views/welcome.js';

const VIEWS = {
  dashboard: dashboardView,
  outline: outlineView,
  settings: settingsView,
  drafts: draftsView,
  welcome: welcomeView,
};

const VALID_VIEWS = new Set(['dashboard', 'outline', 'settings', 'drafts']);
const PATTERN_NAMES = {
  stars: '星空',
  ink: '墨涟',
  grid: '经纬',
  mountains: '远山',
  tide: '潮汐',
  mist: '薄雾',
};
const PATTERN_ORDER = ['stars', 'ink', 'grid', 'mountains', 'tide', 'mist'];
const SAVE_LABELS = {
  idle: '已就绪',
  pending: '待保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

let scrimTimer = null;
let glowFrame = null;
const TAB_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let tabChannel = null;
let lastTabNotice = 0;

const ctx = {
  setView,
  openNovel,
  openDraft,
  openSetting,
  openNovelModal,
  confirm: (options) => confirmDialog(options),
  toast,
};

/* --------------------------------------------------------------------- boot */

async function boot() {
  applyAppearance();
  setThemePattern(state.pattern);
  applySidebarState();
  bindGlobal();
  initTabChannel();
  onSaveChange(updateSaveStatus);

  try {
    await loadLibrary();
    const route = parseHash();
    const known = (id) => state.library.novels.some((novel) => novel.id === id);
    let target = route.novelId && known(route.novelId) ? route.novelId : '';
    if (!target && known(readLastNovel())) target = readLastNovel();
    if (!target && state.library.novels.length) target = state.library.novels[0].id;

    if (target) {
      await openNovel(target, route.view || 'dashboard', { initial: true });
    } else {
      state.view = 'welcome';
      renderAll();
    }
  } catch (error) {
    showFatal(error);
  } finally {
    state.booted = true;
    const screen = $('#bootScreen');
    if (screen) {
      screen.classList.add('is-done');
      setTimeout(() => screen.remove(), 750);
    }
  }
}

async function loadLibrary() {
  const data = await api.library();
  state.library = {
    categories: Array.isArray(data.categories) ? data.categories : [],
    novels: Array.isArray(data.novels) ? data.novels : [],
  };
}

function showFatal(error) {
  console.error(error);
  state.novel = null;
  state.view = 'welcome';
  $('#topbar').innerHTML = `<div class="topbar__identity"><div class="welcome-kicker"><strong>墨夜</strong><small>INK NOCTURNE</small></div></div>`;
  $('#viewRoot').innerHTML = `<div class="view-scroll">
    <div class="empty-state" style="min-height:70vh">
      <span class="empty-state__icon">${icon('alert', 26)}</span>
      <div class="empty-state__title">没有连上本地的写作空间</div>
      <div class="empty-state__text">请确认已经运行了「启动墨夜.bat」或 <code>node server.js</code>，然后再刷新页面。<br>你的故事数据没有被改动。</div>
      <button class="primary-btn" type="button" onclick="location.reload()">${icon('redo', 14)} 重新连接</button>
    </div>
  </div>`;
  $('#sidebar').innerHTML = '';
  const screen = $('#bootScreen');
  if (screen) screen.classList.add('is-done');
}

/* -------------------------------------------------------------------- routing */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'novel' && parts[1]) {
    return { novelId: decodeURIComponent(parts[1]), view: VALID_VIEWS.has(parts[2]) ? parts[2] : 'dashboard' };
  }
  return { novelId: null, view: null };
}

function writeHash(id, view) {
  const hash = id ? `#/novel/${encodeURIComponent(id)}/${view}` : '#/';
  history.replaceState(null, '', hash);
}

async function openNovel(id, view = 'dashboard', options = {}) {
  if (!id) return;
  const nextView = VALID_VIEWS.has(view) ? view : 'dashboard';
  if (state.novel?.meta.id === id) {
    if (state.view !== nextView) setView(nextView);
    return;
  }

  await flushSaves();
  closeSidebar();
  closePopover();
  document.body.classList.remove('is-focus');
  $('#viewRoot').innerHTML = `<div class="view-loading"><span class="spinner"></span><span>正在打开《${esc(
    state.library.novels.find((novel) => novel.id === id)?.title || '小说',
  )}》…</span></div>`;

  try {
    const novel = await api.novel(id);
    state.novel = novel;
    state.view = nextView;
    const latest = [...novel.drafts].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    )[0];
    state.draftId = latest?.id || null;
    const orderedSettings = [...novel.settings.entries].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );
    const firstSetting = orderedSettings.find((entry) => String(entry.body || '').trim()) || orderedSettings[0];
    state.settingId = firstSetting?.id || null;
    state.settingEditing = false;
    state.settingsQuery = '';
    state.focusEditor = Boolean(options.focusEditor);
    setActiveNovel(novel);
    rememberNovel(id);
    writeHash(id, nextView);
    renderAll();
    announceTab();
  } catch (error) {
    toast(error.message || '打开小说失败', 'error');
    if (options.initial) {
      state.view = 'welcome';
      renderAll();
    } else {
      renderView();
    }
  }
}

async function refreshCurrentNovel() {
  if (!state.novel) return;
  const id = state.novel.meta.id;
  const draftId = state.draftId;
  const settingId = state.settingId;
  await flushSaves();
  try {
    const novel = await api.novel(id);
    state.novel = novel;
    setActiveNovel(novel);
    if (draftId && novel.drafts.some((draft) => draft.id === draftId)) state.draftId = draftId;
    if (settingId && novel.settings.entries.some((entry) => entry.id === settingId)) {
      state.settingId = settingId;
    }
    renderAll();
    toast('已重新载入最新版本');
  } catch (error) {
    toast(error.message || '重新载入失败', 'error');
  }
}

function showTabNotice(message) {
  const now = Date.now();
  if (now - lastTabNotice < 20000) return;
  lastTabNotice = now;
  toast(message, 'info', 'info');
}

function initTabChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  tabChannel = new BroadcastChannel('ink-nocturne-tabs');
  tabChannel.addEventListener('message', (event) => {
    const message = event.data || {};
    if (!message.novelId || message.tabId === TAB_ID) return;
    if (message.novelId !== state.novel?.meta.id) return;
    if (message.type === 'hello') {
      tabChannel.postMessage({ type: 'present', tabId: TAB_ID, novelId: message.novelId });
      showTabNotice('另一个标签页也打开了这本书。两边同时写，后保存的会覆盖前面的。');
    } else if (message.type === 'present') {
      showTabNotice('另一个标签页也打开了这本书。建议只保留一个编辑窗口。');
    } else if (message.type === 'saved') {
      showTabNotice('另一个标签页刚刚保存了这本书。当前页面可能不是最新，刷新后再继续。');
    }
  });
  document.addEventListener('ink:saved', () => {
    if (!state.novel) return;
    tabChannel?.postMessage({ type: 'saved', tabId: TAB_ID, novelId: state.novel.meta.id });
  });
}

function announceTab() {
  if (!state.novel || !tabChannel) return;
  tabChannel.postMessage({ type: 'hello', tabId: TAB_ID, novelId: state.novel.meta.id });
}

function setView(view) {
  if (!VALID_VIEWS.has(view)) return;
  if (!state.novel) return;
  if (state.view === view) return;
  flushSaves();
  document.body.classList.remove('is-focus');
  closePopover();
  if (view === 'settings' && state.view !== 'settings') state.settingEditing = false;
  state.view = view;
  writeHash(state.novel.meta.id, view);
  renderTopbar();
  renderView();
}

function openDraft(id, focus = false) {
  state.draftId = id;
  state.focusEditor = focus;
  if (state.view === 'drafts') {
    renderView();
    renderTopbar();
  } else {
    setView('drafts');
  }
}

function openSetting(id) {
  state.settingId = id;
  state.settingEditing = false;
  if (state.view === 'settings') {
    renderView();
  } else {
    setView('settings');
  }
}

/* --------------------------------------------------------------------- render */

function renderAll() {
  renderSidebar();
  renderTopbar();
  renderView();
  document.title = state.novel
    ? `${state.novel.meta.title} · 墨夜`
    : '墨夜 · 小说创作空间';
}

function renderTopbar() {
  const topbar = $('#topbar');
  if (!state.novel) {
    topbar.className = 'topbar topbar--empty';
    topbar.innerHTML = `
      <button class="icon-btn topbar__menu" type="button" data-menu aria-label="显示或收起书架" title="显示或收起书架">${icon('menu', 18)}</button>
      <div class="topbar__identity">
        <div class="welcome-kicker"><strong>墨夜</strong><small>INK NOCTURNE</small></div>
      </div>
      <div class="topbar__actions">
        <button class="ghost-btn btn-sm" type="button" data-action="new-novel">${icon('plus', 13)} 新建小说</button>
      </div>`;
    topbar.querySelector('[data-menu]')?.addEventListener('click', toggleSidebar);
    topbar.querySelector('[data-action="new-novel"]')?.addEventListener('click', () => openNovelModal('create'));
    applySidebarState();
    return;
  }

  const novel = state.novel;
  const { meta } = novel;
  const tabs = [
    { id: 'dashboard', label: '总览', icon: 'dashboard' },
    { id: 'outline', label: '大纲', icon: 'list', count: novel.outline.beats.length },
    { id: 'settings', label: '设定', icon: 'layers', count: novel.settings.entries.length },
    { id: 'drafts', label: '正文', icon: 'feather', count: novel.drafts.length },
  ];

  topbar.className = 'topbar';
  topbar.innerHTML = `
    <button class="icon-btn topbar__menu" type="button" data-menu aria-label="显示或收起书架" title="显示或收起书架">${icon('menu', 18)}</button>
    <div class="topbar__identity">
      <div class="topbar__breadcrumb">${icon('library', 11)} 书架 <span>/</span> ${esc(meta.category)}</div>
      <div class="topbar__title-row">
        <h1 class="topbar__title" title="${esc(meta.title)}">${esc(meta.title)}</h1>
        <span class="topbar__category">${esc(meta.category)}</span>
      </div>
    </div>
    <nav class="topbar__tabs" aria-label="小说内容">
      ${tabs
        .map(
          (tab) => `<button class="tab-btn ${state.view === tab.id ? 'is-active' : ''}" type="button" data-tab="${tab.id}">
            ${icon(tab.icon, 14)}<span>${tab.label}</span>
            ${tab.count !== undefined ? `<span class="tab-btn__count">${tab.count}</span>` : ''}
          </button>`,
        )
        .join('')}
    </nav>
    <div class="topbar__actions">
      <button class="icon-btn topbar__search" type="button" data-action="search" title="全书搜索（Ctrl+K）" aria-label="全书搜索">${icon('search', 16)}</button>
      <div class="save-status" data-status="${state.save.status}">
        <span class="save-status__dot"></span><span>${SAVE_LABELS[state.save.status] || '已就绪'}</span>
      </div>
      <span class="topbar__divider"></span>
      <button class="icon-btn" type="button" data-action="more" title="更多">${icon('more', 16)}</button>
    </div>`;

  topbar.querySelector('[data-menu]')?.addEventListener('click', toggleSidebar);
  topbar.querySelectorAll('[data-tab]').forEach((button) =>
    button.addEventListener('click', () => setView(button.dataset.tab)),
  );
  topbar.querySelector('[data-action="more"]')?.addEventListener('click', (event) =>
    openMoreMenu(event.currentTarget),
  );
  topbar.querySelector('[data-action="search"]')?.addEventListener('click', () => openSearch(ctx));
  updateSaveStatus(state.save);
  applySidebarState();
}

function renderView() {
  const root = $('#viewRoot');
  if (!state.novel) {
    document.body.classList.remove('is-focus');
    root.innerHTML = '';
    welcomeView(root, ctx);
    return;
  }
  document.body.classList.remove('is-focus');
  const view = VALID_VIEWS.has(state.view) ? state.view : 'dashboard';
  const renderer = VIEWS[view];
  root.innerHTML = '';
  renderer(root, ctx);
}

function updateSaveStatus(save) {
  const el = $('.save-status');
  if (!el) return;
  el.dataset.status = save.status;
  const label = el.querySelector('span:last-child');
  if (label) {
    let text = SAVE_LABELS[save.status] || '已就绪';
    if (save.status === 'saved' && save.at) {
      text = `已保存 ${new Date(save.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    label.textContent = text;
  }
  el.title = save.error || (label ? `保存状态：${label.textContent}` : '');
  if (state.novel) {
    document.title = `${save.status === 'pending' || save.status === 'saving' ? '· ' : ''}${state.novel.meta.title} · 墨夜`;
  }
}

/* -------------------------------------------------------------------- sidebar */

function renderSidebar(options = {}) {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  const groups = buildGroups('');
  const query = state.search.trim();

  sidebar.innerHTML = `
    <button class="sidebar__collapse" type="button" data-collapse-sidebar title="收起书架" aria-label="收起书架">${icon('chevronLeft', 15)}</button>
    <button class="sidebar__brand" type="button" data-brand title="回到总览">
      <span class="brand-emblem"><span></span></span>
      <span class="brand-text">
        <span class="brand-text__title">墨夜</span>
        <span class="brand-text__sub">INK NOCTURNE</span>
      </span>
    </button>

    <button class="sidebar__new" type="button" data-new-novel>${icon('plus', 15)} 新建小说</button>

    <div class="sidebar__search">
      ${icon('search', 15)}
      <input id="librarySearch" type="search" placeholder="找一本书…" autocomplete="off" aria-label="搜索书架" value="${esc(state.search)}">
      <span class="kbd">/</span>
    </div>

    <div class="library scroll-area">
      <div class="library__head">
        <span class="library__label">LIBRARY</span>
        <span class="library__count">${state.library.novels.length} 本</span>
      </div>
      ${
        state.library.novels.length
          ? `${groups
              .map((group) => {
                const collapsed = !query && state.collapsed[group.name] === true;
                return `<div class="category ${collapsed ? 'is-collapsed' : ''}" data-category-group="${esc(group.name)}" data-category-name="${esc(group.name.toLowerCase())}">
                  <button class="category__head" type="button" data-category="${esc(group.name)}">
                    <span class="category__chevron">${icon('chevronDown', 12)}</span>
                    <span class="category__dot" style="--cat-color:${esc(group.color)}"></span>
                    <span class="category__name">${esc(group.name)}</span>
                    <span class="category__count">${group.novels.length}</span>
                  </button>
                  <div class="novel-list">
                    ${group.novels
                      .map(
                        (novel) => `<button class="novel-row ${state.novel?.meta.id === novel.id ? 'is-active' : ''}" type="button" data-novel-id="${esc(novel.id)}" data-search="${esc(
                          `${novel.title} ${novel.summary || ''} ${novel.category}`.toLowerCase(),
                        )}" title="${esc(novel.title)}">
                          ${miniCover(novel)}
                          <span class="novel-row__info">
                            <span class="novel-row__title">${esc(novel.title)}</span>
                            <span class="novel-row__meta">
                              <span>${formatNumber(novel.wordCount)} 字</span><i></i><span>${novel.draftCount || 0} 章</span>
                            </span>
                          </span>
                        </button>`,
                      )
                      .join('')}
                  </div>
                </div>`;
              })
              .join('')}
            <div class="library__no-results" hidden><strong>没有找到这本书</strong>换个关键词，或新建一部小说。</div>`
          : `<div class="library__empty"><strong>书架还是空的</strong>新建第一部小说，把故事放进来。<br><br><button class="ghost-btn btn-sm" type="button" data-new-novel>${icon('plus', 13)} 新建小说</button></div>`
      }
    </div>

    <div class="sidebar__footer">
      <div class="sidebar__appearance">
        <div class="appearance-row">
          <span class="appearance-row__label">界面</span>
          <div class="scheme-mini" role="group" aria-label="界面明暗">
            <button type="button" data-scheme-choice="dark" class="${state.scheme === 'dark' ? 'is-active' : ''}">暗色</button>
            <button type="button" data-scheme-choice="light" class="${state.scheme === 'light' ? 'is-active' : ''}">亮色</button>
          </div>
        </div>
        <div class="appearance-row">
          <span class="appearance-row__label">主题色</span>
          <div class="accent-dots" role="group" aria-label="主题颜色">
            ${ACCENT_ORDER.map(
              (key) => `<button class="accent-dot ${state.accent === key ? 'is-active' : ''}" type="button" data-accent-choice="${key}" style="--dot:${ACCENTS[key].color};--dot-2:${ACCENTS[key].color2};--dot-3:${ACCENTS[key].color3}" title="${ACCENTS[key].name}" aria-label="主题色：${ACCENTS[key].name}"></button>`,
            ).join('')}
          </div>
        </div>
      </div>
      <div class="pattern-switcher__head">
        <span class="pattern-switcher__label">BACKGROUND</span>
        <span class="pattern-switcher__now">${PATTERN_NAMES[state.pattern] || '星空'}</span>
      </div>
      <div class="pattern-options">
        ${PATTERN_ORDER
          .map(
            (pattern) => `<button class="pattern-option ${state.pattern === pattern ? 'is-active' : ''}" type="button" data-pattern="${pattern}" title="${PATTERN_NAMES[pattern]}">
              <span class="pattern-option__art pattern-option__art--${pattern}"></span>
              <span>${PATTERN_NAMES[pattern]}</span>
            </button>`,
          )
          .join('')}
      </div>
      <div class="local-badge"><span class="local-badge__dot"></span><span>本地私有 · 自动保存</span><span>LOCAL</span></div>
    </div>`;

  sidebar.querySelector('[data-brand]')?.addEventListener('click', () => {
    if (state.novel) setView('dashboard');
    closeSidebar();
  });
  sidebar.querySelector('[data-collapse-sidebar]')?.addEventListener('click', () => {
    state.sidebarCollapsed = true;
    localStorage.setItem('ink.sidebarCollapsed', '1');
    applySidebarState();
  });
  sidebar.querySelectorAll('[data-new-novel]').forEach((button) =>
    button.addEventListener('click', () => openNovelModal('create')),
  );
  sidebar.querySelectorAll('[data-novel-id]').forEach((button) =>
    button.addEventListener('click', () => openNovel(button.dataset.novelId)),
  );
  sidebar.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.category;
      state.collapsed[name] = state.collapsed[name] !== true;
      persistCollapsed();
      renderSidebar();
    });
  });
  sidebar.querySelectorAll('[data-pattern]').forEach((button) => {
    button.addEventListener('click', () => {
      setThemePattern(button.dataset.pattern);
      renderSidebar();
    });
  });
  sidebar.querySelectorAll('[data-scheme-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      setScheme(button.dataset.schemeChoice);
    });
  });
  sidebar.querySelectorAll('[data-accent-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      setAccent(button.dataset.accentChoice);
    });
  });

  const search = $('#librarySearch');
  if (search) {
    search.addEventListener('input', () => {
      state.search = search.value;
      filterSidebar(state.search);
    });
  }

  filterSidebar(state.search);
  if (options.focusSearch) search?.focus();
}

function filterSidebar(rawQuery) {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  const query = String(rawQuery || '').trim().toLowerCase();
  let visible = 0;

  sidebar.querySelectorAll('.category').forEach((group) => {
    const categoryMatch = !query || (group.dataset.categoryName || '').includes(query);
    let groupVisible = 0;
    group.querySelectorAll('.novel-row').forEach((row) => {
      const show = !query || categoryMatch || (row.dataset.search || '').includes(query);
      row.hidden = !show;
      if (show) groupVisible += 1;
    });
    group.hidden = Boolean(query) && groupVisible === 0;
    if (!query) {
      group.hidden = false;
      group.classList.toggle('is-collapsed', state.collapsed[group.dataset.categoryGroup] === true);
    } else {
      group.classList.remove('is-collapsed');
    }
    visible += groupVisible;
  });

  const noResults = sidebar.querySelector('.library__no-results');
  if (noResults) noResults.hidden = !query || visible > 0;
}

function buildGroups(query) {
  const categoryOrder = [];
  const colors = new Map();
  for (const category of state.library.categories) {
    if (!categoryOrder.includes(category.name)) categoryOrder.push(category.name);
    colors.set(category.name, category.color);
  }
  for (const novel of state.library.novels) {
    if (!categoryOrder.includes(novel.category)) {
      categoryOrder.push(novel.category);
      colors.set(
        novel.category,
        TERM_PALETTE[colors.size % TERM_PALETTE.length],
      );
    }
  }

  const groups = [];
  for (const name of categoryOrder) {
    let novels = state.library.novels
      .filter((novel) => novel.category === name)
      .sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)));
    if (query) {
      const categoryMatches = name.toLowerCase().includes(query);
      if (!categoryMatches) {
        novels = novels.filter(
          (novel) =>
            novel.title.toLowerCase().includes(query) ||
            String(novel.summary || '').toLowerCase().includes(query),
        );
      }
    }
    if (novels.length) {
      groups.push({
        name,
        color: colors.get(name) || '#a78bfa',
        novels,
      });
    }
  }
  return groups;
}

function applySidebarState() {
  const shell = $('#appShell');
  if (!shell) return;
  shell.classList.toggle('is-sidebar-collapsed', state.sidebarCollapsed);
  const menu = document.querySelector('[data-menu]');
  if (menu) {
    const label = window.innerWidth <= 1024 ? '打开书架' : state.sidebarCollapsed ? '展开书架' : '收起书架';
    menu.title = label;
    menu.setAttribute('aria-label', label);
  }
}

function toggleSidebar() {
  if (window.innerWidth <= 1024) {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    if (sidebar.classList.contains('is-open')) closeSidebar();
    else openSidebar();
    return;
  }
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem('ink.sidebarCollapsed', state.sidebarCollapsed ? '1' : '0');
  applySidebarState();
}

function openSidebar() {
  const sidebar = $('#sidebar');
  const scrim = $('#sidebarScrim');
  clearTimeout(scrimTimer);
  scrim.hidden = false;
  sidebar.classList.add('is-open');
  requestAnimationFrame(() => scrim.classList.add('is-open'));
}

function closeSidebar() {
  const sidebar = $('#sidebar');
  const scrim = $('#sidebarScrim');
  if (!sidebar?.classList.contains('is-open')) return;
  sidebar.classList.remove('is-open');
  scrim.classList.remove('is-open');
  clearTimeout(scrimTimer);
  scrimTimer = setTimeout(() => {
    scrim.hidden = true;
  }, 260);
}

/* --------------------------------------------------------------- export menus */

function openAppearanceMenu(anchor) {
  showPopover(
    anchor,
    `<div class="appearance-panel">
      <div class="appearance-section">
        <div class="appearance-section__label">界面模式</div>
        <div class="scheme-options">
          <button class="scheme-option ${state.scheme === 'dark' ? 'is-active' : ''}" type="button" data-scheme-choice="dark">
            ${icon('moon', 15)} 暗色
          </button>
          <button class="scheme-option ${state.scheme === 'light' ? 'is-active' : ''}" type="button" data-scheme-choice="light">
            ${icon('sun', 15)} 亮色
          </button>
        </div>
      </div>
      <div class="appearance-section">
        <div class="appearance-section__label">主题颜色</div>
        <div class="accent-options">
          ${ACCENT_ORDER.map(
            (key) => `<button class="accent-option ${state.accent === key ? 'is-active' : ''}" type="button" data-accent-choice="${key}" style="--dot:${ACCENTS[key].color};--dot-2:${ACCENTS[key].color2};--dot-3:${ACCENTS[key].color3}">
              <span class="accent-option__dot"></span>${ACCENTS[key].name}
            </button>`,
          ).join('')}
        </div>
      </div>
      <div class="appearance-section">
        <div class="appearance-section__label">背景纹理</div>
        <div class="mini-pattern-options">
          ${PATTERN_ORDER
            .map(
              (pattern) => `<button class="mini-pattern-option ${state.pattern === pattern ? 'is-active' : ''}" type="button" data-pattern="${pattern}">
                <span class="pattern-option__art pattern-option__art--${pattern}"></span>
                <span>${PATTERN_NAMES[pattern]}</span>
              </button>`,
            )
            .join('')}
        </div>
      </div>
    </div>`,
    {
      width: 276,
      className: 'appearance-popover',
      onMount(element) {
        element.querySelectorAll('[data-scheme-choice]').forEach((button) => {
          button.addEventListener('click', () => {
            setScheme(button.dataset.schemeChoice);
          });
        });
        element.querySelectorAll('[data-accent-choice]').forEach((button) => {
          button.addEventListener('click', () => {
            setAccent(button.dataset.accentChoice);
          });
        });
        element.querySelectorAll('[data-pattern]').forEach((button) => {
          button.addEventListener('click', () => {
            setThemePattern(button.dataset.pattern);
            const now = document.querySelector('.pattern-switcher__now');
            if (now) now.textContent = PATTERN_NAMES[button.dataset.pattern] || '';
          });
        });
      },
    },
  );
}

function openMoreMenu(anchor) {
  showPopover(
    anchor,
    `<div class="popover__label">EXPORT</div>
     <button class="menu-item" type="button" data-export="md">${icon('download', 14)} 导出 Markdown 全书</button>
     <button class="menu-item" type="button" data-export="json">${icon('save', 14)} 导出 JSON 备份</button>
     <div class="menu-separator"></div>
     <button class="menu-item" type="button" data-open-appearance>${icon('palette', 14)} 外观与主题</button>
     <button class="menu-item" type="button" data-reveal-folder>${icon('folder', 14)} 打开本地文件夹</button>
     <div class="menu-separator"></div>
     <button class="menu-item" type="button" data-open-history>${icon('clock', 14)} 版本历史</button>
     <button class="menu-item" type="button" data-open-trash>${icon('undo', 14)} 最近删除</button>
     <div class="menu-separator"></div>
     <button class="menu-item menu-item--danger" type="button" data-delete>${icon('trash', 14)} 删除这部小说</button>`,
    {
      width: 232,
      onMount(element, close) {
        element.querySelectorAll('[data-export]').forEach((button) => {
          button.addEventListener('click', () => {
            downloadNovel(button.dataset.export);
            close();
          });
        });
        element.querySelector('[data-open-appearance]')?.addEventListener('click', () => {
          openAppearanceMenu(anchor);
        });
        element.querySelector('[data-reveal-folder]')?.addEventListener('click', async () => {
          close();
          try {
            await api.reveal(state.novel.meta.id);
            toast('已在资源管理器中打开小说文件夹', 'success', 'folder');
          } catch (error) {
            toast(error.message || '打开文件夹失败', 'error');
          }
        });
        element.querySelector('[data-open-trash]')?.addEventListener('click', () => {
          close();
          openTrash(async () => {
            await loadLibrary();
            renderSidebar();
          });
        });
        element.querySelector('[data-open-history]')?.addEventListener('click', async () => {
          close();
          await flushSaves();
          openHistory(state.novel, refreshCurrentNovel);
        });
        element.querySelector('[data-delete]')?.addEventListener('click', () => {
          close();
          deleteNovel();
        });
      },
    },
  );
}

function downloadNovel(format) {
  if (!state.novel) return;
  const link = document.createElement('a');
  link.href = api.exportUrl(state.novel.meta.id, format);
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast(format === 'json' ? '正在导出 JSON 备份' : '正在导出 Markdown 全书', 'success', 'download');
}

async function deleteNovel() {
  const novel = state.novel;
  if (!novel) return;
  const confirmed = await confirmDialog({
    title: '删除这部小说？',
    message: `《${novel.meta.title}》的 ${novel.drafts.length} 章、${novel.settings.entries.length} 个设定和全部大纲都会移到 data/.trash。\n如果只是想备份，建议先导出 JSON。`,
    confirmText: '删除小说',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await flushSaves();
    await api.deleteNovel(novel.meta.id);
    state.library.novels = state.library.novels.filter((item) => item.id !== novel.meta.id);
    state.novel = null;
    state.draftId = null;
    state.settingId = null;
    rememberNovel('');
    const next = state.library.novels[0];
    if (next) {
      await openNovel(next.id);
      toast('小说已移入回收文件夹');
    } else {
      state.view = 'welcome';
      writeHash(null, null);
      renderAll();
      toast('小说已移入回收文件夹');
    }
  } catch (error) {
    toast(error.message || '删除失败', 'error');
  }
}

/* -------------------------------------------------------------- novel modal */

function openNovelModal(mode = 'create') {
  const editing = mode === 'edit' && state.novel;
  const meta = editing
    ? state.novel.meta
    : { title: '', category: '未分类', summary: '', cover: 'jade', goal: 100000 };
  let coverKey = meta.cover || 'jade';
  const categoryOptions = state.library.categories
    .map((category) => `<option value="${esc(category.name)}"></option>`)
    .join('');

  const modal = openModal({
    title: editing ? '编辑小说资料' : '新建一部小说',
    eyebrow: editing ? 'NOVEL PROFILE' : 'NEW STORY',
    size: 'lg',
    body: `<form id="novelForm" class="form-stack" autocomplete="off">
      <div class="field">
        <label for="novelTitle">书名</label>
        <input class="text-input" id="novelTitle" name="title" value="${esc(meta.title)}" placeholder="比如：长夜行舟" data-select="true" maxlength="60" required>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="novelCategory">分类</label>
          <input class="text-input" id="novelCategory" name="category" value="${esc(meta.category)}" list="categoryOptions" placeholder="玄幻、都市、悬疑…">
          <datalist id="categoryOptions">${categoryOptions}</datalist>
          <div class="form-hint">可以直接输入新分类，会自动加入书架。</div>
        </div>
        <div class="field">
          <label for="novelGoal">目标字数</label>
          <input class="text-input" id="novelGoal" name="goal" type="number" min="0" max="99999999" step="1000" value="${Number(meta.goal) || 100000}">
        </div>
      </div>
      <div class="field">
        <label for="novelSummary">一句话简介</label>
        <textarea class="textarea" id="novelSummary" name="summary" rows="3" maxlength="800" placeholder="用一两句话，把这个故事最想被记住的部分写下来。">${esc(meta.summary)}</textarea>
      </div>
      <div class="field">
        <span class="field-label">封面气质</span>
        <div class="cover-picker">
          ${Object.entries(COVERS)
            .map(
              ([key, cover]) => `<button class="cover-swatch ${key === coverKey ? 'is-active' : ''}" type="button" data-cover="${key}" title="${esc(cover.name)}" style="--ca:${cover.a};--cb:${cover.b};--cc:${cover.c}"></button>`,
            )
            .join('')}
        </div>
      </div>
    </form>`,
    footer: `<button class="ghost-btn" type="button" data-close>取消</button>
      <button class="primary-btn" type="submit" form="novelForm" id="novelSubmit">${editing ? '保存资料' : '创建小说'}</button>`,
    onMount(panel, close) {
      const form = panel.querySelector('#novelForm');
      const submit = panel.querySelector('#novelSubmit');
      panel.querySelectorAll('[data-cover]').forEach((button) => {
        button.addEventListener('click', () => {
          coverKey = button.dataset.cover;
          panel.querySelectorAll('[data-cover]').forEach((item) =>
            item.classList.toggle('is-active', item === button),
          );
        });
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const title = String(data.get('title') || '').trim();
        if (!title) {
          toast('书名不能为空', 'error');
          panel.querySelector('#novelTitle')?.focus();
          return;
        }
        const payload = {
          title,
          category: String(data.get('category') || '').trim() || '未分类',
          summary: String(data.get('summary') || '').trim(),
          goal: Number(data.get('goal')) || 100000,
          cover: coverKey,
        };
        submit.disabled = true;
        submit.textContent = editing ? '保存中…' : '创建中…';
        try {
          if (editing) {
            Object.assign(state.novel.meta, payload);
            state.novel.meta.updatedAt = new Date().toISOString();
            const libraryEntry = state.library.novels.find((item) => item.id === state.novel.meta.id);
            if (libraryEntry) Object.assign(libraryEntry, payload);
            const exists = state.library.categories.some((item) => item.name === payload.category);
            if (!exists) {
              state.library.categories.push({
                name: payload.category,
                color: TERM_PALETTE[state.library.categories.length % TERM_PALETTE.length],
              });
            }
            queueSave('meta');
            close();
            renderAll();
            toast('小说资料已更新');
          } else {
            const novel = await api.createNovel(payload);
            state.search = '';
            await loadLibrary();
            close();
            await openNovel(novel.meta.id, 'dashboard');
            toast('新小说已建好，开始写吧');
          }
        } catch (error) {
          submit.disabled = false;
          submit.textContent = editing ? '保存资料' : '创建小说';
          toast(error.message || '操作失败', 'error');
        }
      });
    },
  });
  return modal;
}

/* ------------------------------------------------------------------- global */

function bindGlobal() {
  $('#sidebarScrim')?.addEventListener('click', closeSidebar);

  window.addEventListener('hashchange', async () => {
    const route = parseHash();
    if (route.novelId && route.novelId !== state.novel?.meta.id) {
      await openNovel(route.novelId, route.view || 'dashboard');
    } else if (route.view && route.view !== state.view) {
      setView(route.view);
    }
  });

  document.addEventListener('keydown', (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    const editing =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      event.target?.isContentEditable;

    if (event.key === 'Escape') {
      if ($('#modalRoot')?.children.length) return;
      if (document.body.classList.contains('is-focus')) {
        document.body.classList.remove('is-focus');
        return;
      }
      if ($('.popover')) {
        closePopover();
        return;
      }
      if ($('#sidebar')?.classList.contains('is-open')) closeSidebar();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      if ($('#modalRoot')?.children.length || !state.novel) return;
      event.preventDefault();
      openSearch(ctx);
      return;
    }

    if (event.key === '/' && !editing && !$('#modalRoot')?.children.length) {
      event.preventDefault();
      if (window.innerWidth <= 1024) openSidebar();
      setTimeout(() => $('#librarySearch')?.focus(), 60);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSaves();
  });
  window.addEventListener('pagehide', () => {
    flushSaves();
    tabChannel?.close();
  });
  window.addEventListener('beforeunload', (event) => {
    if (hasPendingSaves() || ['saving', 'error'].includes(state.save.status)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // The desktop shell calls this before its window closes, so pending edits
  // are flushed even when the user closes the window immediately.
  window.__inkFlush = flushSaves;
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024 && $('#sidebar')?.classList.contains('is-open')) closeSidebar();
    applySidebarState();
  });

  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (event) => {
      if (glowFrame) return;
      glowFrame = requestAnimationFrame(() => {
        document.body.style.setProperty('--mx', `${clamp(event.clientX, 0, window.innerWidth)}px`);
        document.body.style.setProperty('--my', `${clamp(event.clientY, 0, window.innerHeight)}px`);
        glowFrame = null;
      });
    });
  }
}

boot();
