/* 墨夜 · settings / 设定集（阅读优先 + 紧凑编辑） */

import {
  state,
  esc,
  icon,
  uid,
  parseAliases,
  KINDS,
  KIND_NAMES,
  TERM_PALETTE,
  toast,
} from '../core.js';
import { queueSave } from '../store.js';
import { countTermOccurrences } from '../highlight.js';

let pendingFocus = null;
let propsOpen = false;

function collapseKey(novelId) {
  return `ink.settings.collapsed.${novelId}`;
}

function readCollapsed(novelId) {
  try {
    const value = JSON.parse(localStorage.getItem(collapseKey(novelId)) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(novelId, collapsed) {
  localStorage.setItem(collapseKey(novelId), JSON.stringify([...collapsed]));
}

function expandAncestors(entry, entries) {
  if (!state.novel) return;
  const collapsed = readCollapsed(state.novel.meta.id);
  let current = entry;
  const seen = new Set();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    collapsed.delete(current.parentId);
    current = entries.find((item) => item.id === current.parentId);
  }
  writeCollapsed(state.novel.meta.id, collapsed);
}

function depthOf(entry, all) {
  let depth = 0;
  let current = entry;
  const seen = new Set();
  while (current?.parentId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = all.find((item) => item.id === current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
    if (depth > 8) break;
  }
  return Math.min(depth, 2);
}

function childrenOf(entries, parentId) {
  return entries
    .filter((entry) => (entry.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
}

function trailOf(entry, entries) {
  const trail = [];
  const seen = new Set();
  let current = entry;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift(current);
    current = current.parentId ? entries.find((item) => item.id === current.parentId) : null;
  }
  return trail;
}

function descendantIds(entries, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (entry.parentId && ids.has(entry.parentId) && !ids.has(entry.id)) {
        ids.add(entry.id);
        changed = true;
      }
    }
  }
  return ids;
}

function buildTree(entries, collapsed) {
  const known = new Set(entries.map((entry) => entry.id));
  const roots = entries
    .filter((entry) => !entry.parentId || !known.has(entry.parentId))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
  const renderNodes = (items, depth) =>
    items
      .map((entry) => {
        const kids = childrenOf(entries, entry.id);
        return `${treeItem(entry, depth, kids.length > 0, !collapsed.has(entry.id))}${kids.length ? renderNodes(kids, Math.min(depth + 1, 8)) : ''}`;
      })
      .join('');
  return roots.length ? renderNodes(roots, 0) : '';
}

function treeItem(entry, depth, hasChildren, expanded) {
  const kind = KINDS[entry.kind] || KINDS.设定;
  const active = state.settingId === entry.id;
  return `<div class="tree-row ${hasChildren ? 'has-children' : ''}" data-tree-row="${esc(entry.id)}" style="--depth:${depth}">
    <button class="tree-item ${active ? 'is-active' : ''}" type="button" data-setting-id="${esc(entry.id)}" title="${esc(entry.title || '未命名词条')}">
      ${depth > 0 ? '<span class="tree-item__rail"></span>' : ''}
      <span class="kind-badge" style="--kind-color:${kind.color}">${kind.glyph}</span>
      <span class="tree-item__text">
        <span class="tree-item__title">${esc(entry.title || '未命名词条')}</span>
        <span class="tree-item__meta">${esc(entry.kind || '设定')}</span>
      </span>
      <span class="tree-item__level">H${depth + 1}</span>
    </button>
    ${
      hasChildren
        ? `<button class="tree-toggle ${expanded ? '' : 'is-collapsed'}" type="button" data-tree-toggle="${esc(entry.id)}" aria-label="${expanded ? '收起子目录' : '展开子目录'}" aria-expanded="${expanded}">${icon('chevronDown', 12)}</button>`
        : ''
    }
  </div>`;
}

function makeEntry(entries, parentId, overrides = {}) {
  const siblings = childrenOf(entries, parentId);
  const order = siblings.length ? Math.max(...siblings.map((entry) => entry.order || 0)) + 1 : 1;
  return {
    id: uid('s'),
    parentId: parentId || null,
    order,
    kind: '人物',
    title: '新的词条',
    color: KINDS.人物.color,
    aliases: [],
    term: true,
    body: '',
    ...overrides,
  };
}

function kindPills(entry) {
  return KIND_NAMES.map(
    (kind) => `<button class="kind-pill ${entry.kind === kind ? 'is-active' : ''}" type="button" data-kind="${kind}" style="--kind-color:${KINDS[kind].color}">${kind}</button>`,
  ).join('');
}

function bodyParagraphs(entry) {
  const raw = String(entry.body || '').trim();
  if (!raw) {
    return `<div class="setting-read__empty">
      <span class="setting-read__empty-icon">${icon('feather', 20)}</span>
      <p>这个词条还没有内容。外貌、秘密、关系、规则，写一点有用的。</p>
      <button class="ghost-btn btn-sm" type="button" data-action="edit-setting">${icon('edit', 13)} 开始写</button>
    </div>`;
  }
  return raw
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function draftMentions(entry, drafts) {
  return (drafts || [])
    .map((draft) => ({
      id: draft.id,
      title: draft.title || '未命名章节',
      count: countTermOccurrences(entry, [draft]),
    }))
    .filter((item) => item.count > 0);
}

function railHTML(entry, depth, occurrences, mentions, entries) {
  const kind = KINDS[entry.kind] || KINDS.设定;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  const parent = entry.parentId ? entries.find((item) => item.id === entry.parentId) : null;
  const visibleMentions = mentions.slice(0, 6);
  const rest = mentions.length - visibleMentions.length;
  return `<aside class="setting-read__rail">
    <section class="setting-rail__card">
      <div class="setting-rail__title">${icon('info', 13)} 词条信息</div>
      <div class="setting-rail__rows">
        <div><span class="setting-rail__label">类型</span><span class="setting-rail__value"><span class="setting-fact__dot" style="--dot-color:${kind.color}"></span>${esc(entry.kind || '设定')} · H${depth + 1}</span></div>
        <div><span class="setting-rail__label">位置</span><span class="setting-rail__value">${esc(parent ? `「${parent.title || '未命名词条'}」之下` : '顶级标题')}</span></div>
        <div><span class="setting-rail__label">别名</span><span class="setting-rail__value setting-rail__value--chips">${aliases.length ? aliases.map((alias) => `<span class="alias-chip">${esc(alias)}</span>`).join('') : '<span class="setting-fact__muted">无</span>'}</span></div>
        <div><span class="setting-rail__label">上色</span><span class="setting-rail__value"><span class="setting-color-dot" style="--term-color:${esc(entry.color || '#8f8a99')}"></span>${entry.term === false ? '仅目录' : '自动'}</span></div>
        <div><span class="setting-rail__label">正文</span><span class="setting-rail__value">${occurrences ? `${occurrences} 次` : '尚未出现'}</span></div>
      </div>
    </section>
    <section class="setting-rail__card">
      <div class="setting-rail__title">${icon('book', 13)} 出现章节 <span>${mentions.length}</span></div>
      ${
        mentions.length
          ? `<div class="setting-rail__chapters">${visibleMentions
              .map(
                (item) =>
                  `<button class="setting-rail__chapter" type="button" data-open-draft="${esc(item.id)}"><span>${esc(item.title)}</span><em>${item.count}</em></button>`,
              )
              .join('')}${rest > 0 ? `<span class="setting-rail__more">还有 ${rest} 章</span>` : ''}</div>`
          : '<p class="setting-rail__empty">还没有在正文里写到这个词条。</p>'
      }
    </section>
  </aside>`;
}

function factsHTML(entry, depth, occurrences) {
  const kind = KINDS[entry.kind] || KINDS.设定;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  return `<div class="setting-read__facts">
    <div class="setting-fact">
      <span class="setting-fact__label">类型</span>
      <span class="setting-fact__value">
        <span class="setting-fact__dot" style="--dot-color:${kind.color}"></span>
        ${esc(entry.kind || '设定')} · H${depth + 1}
      </span>
    </div>
    <div class="setting-fact setting-fact--aliases">
      <span class="setting-fact__label">别名</span>
      <span class="setting-fact__value">
        ${aliases.length ? aliases.map((alias) => `<span class="alias-chip">${esc(alias)}</span>`).join('') : '<span class="setting-fact__muted">无</span>'}
      </span>
    </div>
    <div class="setting-fact">
      <span class="setting-fact__label">正文</span>
      <span class="setting-fact__value">${occurrences ? `${occurrences} 次` : '尚未出现'}</span>
    </div>
    <div class="setting-fact">
      <span class="setting-fact__label">上色</span>
      <span class="setting-fact__value setting-fact__value--color">
        <span class="setting-color-dot" style="--term-color:${esc(entry.color || '#8f8a99')}"></span>
        ${entry.term === false ? '仅目录' : '自动'}
      </span>
    </div>
  </div>`;
}

function readHTML(entry, depth, entries, drafts) {
  const kind = KINDS[entry.kind] || KINDS.设定;
  const occurrences = countTermOccurrences(entry, drafts);
  const trail = trailOf(entry, entries);
  const ancestors = trail.slice(0, -1);
  const canChild = depth < 2;
  const mentions = draftMentions(entry, drafts);
  return `<div class="setting-read">
    <header class="setting-read__head">
      <div class="setting-read__copy">
        <div class="setting-read__crumb">
          ${icon('library', 12)}
          <span>设定集</span>
          ${ancestors.map((item) => `<span class="setting-read__sep">/</span><span>${esc(item.title || '未命名词条')}</span>`).join('')}
        </div>
        <h2 class="setting-read__title">${esc(entry.title || '未命名词条')}</h2>
        <div class="setting-read__badges">
          <span class="setting-kind-chip" style="--kind-color:${kind.color}"><span class="kind-badge" style="--kind-color:${kind.color}">${kind.glyph}</span>${esc(entry.kind || '设定')}</span>
          <span class="setting-level-chip">H${depth + 1}</span>
          ${depth === 0 ? '<span class="setting-root-chip">顶级词条</span>' : ''}
        </div>
      </div>
      <div class="setting-read__actions">
        <button class="primary-btn btn-sm" type="button" data-action="edit-setting">${icon('edit', 13)} 编辑</button>
        <button class="icon-btn" type="button" data-action="add-child" title="${canChild ? '添加子条目' : '最多支持三级标题'}" ${canChild ? '' : 'disabled'}>${icon('plus', 15)}</button>
      </div>
    </header>
    ${factsHTML(entry, depth, occurrences)}
    <article class="setting-read__body">${bodyParagraphs(entry)}</article>
    <div class="setting-read__foot">
      <span>${depth === 0 ? '顶级标题' : `位于「${esc(trail[trail.length - 2]?.title || '上一级')}」之下`}</span>
      <span>${entry.term === false ? '仅作为目录标题' : '正文中自动显示为该颜色'}</span>
    </div>
    ${railHTML(entry, depth, occurrences, mentions, entries)}
  </div>`;
}

function editHTML(entry, depth, entries, drafts) {
  const kind = KINDS[entry.kind] || KINDS.设定;
  const occurrences = countTermOccurrences(entry, drafts);
  const parent = entry.parentId ? entries.find((item) => item.id === entry.parentId) : null;
  const siblings = childrenOf(entries, entry.parentId);
  const index = siblings.findIndex((item) => item.id === entry.id);
  const canChild = depth < 2;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];

  return `<div class="setting-editor setting-editor--edit">
    <div class="setting-edit__top">
      <div class="setting-edit__crumb">${icon('edit', 12)} 正在编辑词条</div>
      <div class="setting-edit__actions">
        <button class="primary-btn btn-sm" type="button" data-action="finish-edit">${icon('check', 13)} 完成</button>
        <button class="icon-btn" type="button" data-action="add-child" title="${canChild ? '添加子条目' : '最多支持三级标题'}" ${canChild ? '' : 'disabled'}>${icon('plus', 15)}</button>
        <button class="icon-btn" type="button" data-action="move-up" title="上移" ${index <= 0 ? 'disabled' : ''}>${icon('arrowUp', 14)}</button>
        <button class="icon-btn" type="button" data-action="move-down" title="下移" ${index >= siblings.length - 1 ? 'disabled' : ''}>${icon('arrowDown', 14)}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-action="delete-setting" title="删除词条">${icon('trash', 14)}</button>
      </div>
    </div>

    <input class="setting-title" id="settingTitle" value="${esc(entry.title || '')}" placeholder="给这个词条一个名字" aria-label="词条标题">
    <div class="setting-subline">
      <span class="setting-subline__level">H${depth + 1}</span>
      <span>${esc(parent ? `属于「${parent.title || '未命名词条'}」` : '顶级标题')}</span>
      <span>·</span>
      <span>${esc(entry.kind || '设定')}</span>
    </div>

    <div class="setting-form">
      <details class="setting-props" id="settingProps" ${propsOpen ? 'open' : ''}>
        <summary>
          <span class="setting-props__summary-title">${icon('settings', 13)} 词条属性</span>
          <span class="setting-props__summary-meta">${esc(entry.kind || '设定')} · H${depth + 1} · ${aliases.length} 个别名</span>
          <span class="setting-props__chevron">${icon('chevronDown', 13)}</span>
        </summary>
        <div class="setting-props__body">
          <div class="field">
            <span class="field-label">类型</span>
            <div class="kind-pills">${kindPills(entry)}</div>
          </div>
          <div class="setting-meta-grid">
            <div class="field">
              <label for="settingAliases">别名 / 其他叫法</label>
              <input class="text-input" id="settingAliases" value="${esc(aliases.join('、'))}" placeholder="用顿号或逗号隔开，例如：阿砚、砚哥">
              <div class="form-hint">正文里出现这些名字时，也会自动使用这个颜色。</div>
            </div>
            <div class="field">
              <span class="field-label">词条颜色</span>
              <div class="color-row">
                ${TERM_PALETTE.map(
                  (color) =>
                    `<button class="color-dot ${entry.color === color ? 'is-active' : ''}" type="button" data-color="${color}" style="--dot-color:${color}" title="${color}" aria-label="使用颜色 ${color}"></button>`,
                ).join('')}
              </div>
            </div>
          </div>

          <div class="term-toggle-row">
            <div class="term-toggle-row__copy">
              <span class="term-toggle-row__title">作为词条在正文中上色</span>
              <span class="term-toggle-row__hint">${entry.term === false ? '关闭后只作为目录标题，不参与自动上色' : '开启后，名字和别名会在正文里自动显示为上面的颜色'}</span>
            </div>
            <button class="switch ${entry.term !== false ? 'is-on' : ''}" type="button" data-action="toggle-term" role="switch" aria-checked="${entry.term !== false}" aria-label="切换词条上色"></button>
          </div>
        </div>
      </details>

      <div class="field setting-body-field">
        <label for="settingBody">档案内容</label>
        <textarea class="setting-body" id="settingBody" placeholder="写下这个人物、地点或概念的关键信息。外貌、秘密、关系、规则……只写有用的部分就好。">${esc(entry.body || '')}</textarea>
      </div>

      <div class="setting-foot">
        <span>${entry.term === false ? '目录标题 · 不在正文中上色' : occurrences ? `正文中已出现 ${occurrences} 次` : '还没有在正文中出现'}</span>
        <span class="chip"><span class="chip__dot" style="--chip-color:${kind.color}"></span>${esc(entry.kind || '设定')} · H${depth + 1}</span>
      </div>
    </div>
  </div>`;
}

export function render(root, ctx, options = {}) {
  const novel = state.novel;
  if (!novel) return;
  const entries = novel.settings.entries;
  const previousTree = root.querySelector('.settings-tree__scroll');
  const previousDetail = root.querySelector('.settings-detail');
  const treeScroll = previousTree?.scrollTop || 0;
  const detailScroll = options.resetDetail ? 0 : previousDetail?.scrollTop || 0;

  if (!entries.length) {
    state.settingEditing = false;
    root.innerHTML = `<div class="settings-view">
      <div class="view-head">
        <div class="view-head__copy">
          <div class="eyebrow">WORLD BIBLE</div>
          <h2 class="view-head__title">设定集</h2>
          <p class="view-head__sub">人物、地点、物件和规则。用多级标题把世界收进一个抽屉里。</p>
        </div>
        <div class="view-head__actions">
          <button class="ghost-btn btn-sm" type="button" data-action="add-root">${icon('plus', 13)} 新建词条</button>
        </div>
      </div>
      <div class="settings-empty">
        <span class="empty-state__icon">${icon('layers', 24)}</span>
        <strong>先收进第一个名字</strong>
        <p>为人物建一个词条，选一个颜色。之后在正文里写到这个名字，它就会自动带上颜色。<br>词条可以分层，最多三级标题。</p>
        <div class="settings-empty__badges">
          ${KIND_NAMES.slice(0, 5)
            .map(
              (kind) =>
                `<span class="chip"><span class="chip__dot" style="--chip-color:${KINDS[kind].color}"></span>${kind}</span>`,
            )
            .join('')}
        </div>
        <button class="primary-btn" type="button" data-action="add-root">${icon('plus', 14)} 新建第一个词条</button>
      </div>
    </div>`;
    root.querySelectorAll('[data-action="add-root"]').forEach((button) =>
      button.addEventListener('click', () => addRoot(root, ctx)),
    );
    return;
  }

  const orderedEntries = entries.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const selected =
    entries.find((entry) => entry.id === state.settingId) ||
    orderedEntries.find((entry) => String(entry.body || '').trim()) ||
    orderedEntries[0];
  state.settingId = selected.id;
  const depth = depthOf(selected, entries);
  const terminal = entries.filter((entry) => entry.term !== false && entry.color).length;
  const editing = Boolean(state.settingEditing);
  const collapsed = readCollapsed(novel.meta.id);

  root.innerHTML = `<div class="settings-view">
    <div class="view-head">
      <div class="view-head__copy">
        <div class="eyebrow">WORLD BIBLE</div>
        <h2 class="view-head__title">设定集</h2>
        <p class="view-head__sub">${entries.length} 个词条 · ${terminal} 个会自动上色 · 点击左侧开始阅读</p>
      </div>
      <div class="view-head__actions">
        <button class="ghost-btn btn-sm" type="button" data-action="add-root">${icon('plus', 13)} 新建词条</button>
      </div>
    </div>
    <div class="settings-layout">
      <aside class="settings-tree">
        <div class="settings-tree__head">
          <div class="settings-tree__title">${icon('folder', 14)} 词条目录 <span class="settings-tree__count">${entries.length}</span></div>
          <button class="icon-btn" type="button" data-action="add-root" title="新建顶级词条" style="width:28px;height:28px">${icon('plus', 14)}</button>
        </div>
        <div class="settings-tree__search">
          ${icon('search', 13)}
          <input id="settingsSearch" type="search" autocomplete="off" placeholder="搜索名字、别名、正文…" value="${esc(state.settingsQuery || '')}" aria-label="搜索设定词条">
        </div>
        <div class="settings-tree__scroll scroll-area">${buildTree(entries, collapsed)}<div class="settings-tree__empty" id="settingsTreeEmpty" hidden>没有匹配的词条。</div></div>
      </aside>
      <section class="settings-detail scroll-area">${editing ? editHTML(selected, depth, entries, novel.drafts) : readHTML(selected, depth, entries, novel.drafts)}</section>
    </div>
  </div>`;

  requestAnimationFrame(() => {
    const tree = root.querySelector('.settings-tree__scroll');
    const detail = root.querySelector('.settings-detail');
    if (tree) tree.scrollTop = treeScroll;
    if (detail) detail.scrollTop = detailScroll;
    if (pendingFocus) {
      const target = pendingFocus === 'title' ? root.querySelector('#settingTitle') : root.querySelector('#settingBody');
      pendingFocus = null;
      if (target) {
        target.focus();
        if (target.tagName === 'INPUT') target.select();
        else {
          const length = target.value.length;
          target.setSelectionRange(length, length);
        }
      }
    }
  });

  const selectedEntry = () => entries.find((entry) => entry.id === state.settingId);

  const searchInput = root.querySelector('#settingsSearch');
  const applyTreeFilter = () => {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    state.settingsQuery = searchInput?.value || '';
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const visible = new Set();
    if (query) {
      for (const entry of entries) {
        const hay = `${entry.title || ''} ${(entry.aliases || []).join(' ')} ${entry.body || ''} ${entry.kind || ''}`.toLowerCase();
        if (!hay.includes(query)) continue;
        visible.add(entry.id);
        let current = entry;
        const seen = new Set();
        while (current?.parentId && !seen.has(current.parentId)) {
          seen.add(current.parentId);
          visible.add(current.parentId);
          current = byId.get(current.parentId);
        }
      }
    }

    const hiddenByCollapse = (entry) => {
      let current = entry;
      const seen = new Set();
      while (current?.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        if (collapsed.has(current.parentId)) return true;
        current = byId.get(current.parentId);
      }
      return false;
    };

    root.querySelectorAll('[data-tree-row]').forEach((row) => {
      const entry = byId.get(row.dataset.treeRow);
      row.hidden = Boolean(query) ? !visible.has(row.dataset.treeRow) : hiddenByCollapse(entry);
    });
    root.querySelectorAll('[data-tree-toggle]').forEach((button) => {
      const isCollapsed = collapsed.has(button.dataset.treeToggle);
      button.classList.toggle('is-collapsed', isCollapsed);
      button.setAttribute('aria-expanded', String(!isCollapsed));
      button.setAttribute('aria-label', isCollapsed ? '展开子目录' : '收起子目录');
    });
    const empty = root.querySelector('#settingsTreeEmpty');
    if (empty) empty.hidden = !query || visible.size > 0;
  };
  searchInput?.addEventListener('input', applyTreeFilter);
  applyTreeFilter();

  root.querySelectorAll('[data-tree-toggle]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.treeToggle;
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      writeCollapsed(novel.meta.id, collapsed);
      applyTreeFilter();
    });
  });

  root.querySelectorAll('[data-setting-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settingId = button.dataset.settingId;
      state.settingEditing = false;
      propsOpen = false;
      render(root, ctx, { resetDetail: true });
    });
  });

  root.querySelectorAll('[data-action="add-root"]').forEach((button) =>
    button.addEventListener('click', () => addRoot(root, ctx)),
  );
  root.querySelectorAll('[data-open-draft]').forEach((button) => {
    button.addEventListener('click', () => ctx.openDraft(button.dataset.openDraft));
  });
  root.querySelectorAll('[data-action="add-child"]').forEach((button) =>
    button.addEventListener('click', () => addChild(root, ctx)),
  );

  root.querySelectorAll('[data-action="edit-setting"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settingEditing = true;
      propsOpen = true;
      pendingFocus = null;
      render(root, ctx, { resetDetail: true });
    });
  });

  root.querySelectorAll('[data-action="finish-edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settingEditing = false;
      propsOpen = false;
      render(root, ctx, { resetDetail: true });
    });
  });

  const props = root.querySelector('#settingProps');
  props?.addEventListener('toggle', () => {
    propsOpen = props.open;
  });

  root.querySelectorAll('[data-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = selectedEntry();
      if (!entry) return;
      const next = button.dataset.kind;
      const defaults = Object.values(KINDS).map((item) => item.color);
      entry.kind = next;
      if (defaults.includes(entry.color)) entry.color = KINDS[next].color;
      queueSave('settings');
      render(root, ctx);
    });
  });

  root.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = selectedEntry();
      if (!entry) return;
      entry.color = button.dataset.color;
      queueSave('settings');
      render(root, ctx);
    });
  });

  root.querySelector('[data-action="toggle-term"]')?.addEventListener('click', () => {
    const entry = selectedEntry();
    if (!entry) return;
    entry.term = entry.term === false;
    queueSave('settings');
    render(root, ctx);
  });

  root.querySelector('[data-action="move-up"]')?.addEventListener('click', () => moveEntry(root, ctx, -1));
  root.querySelector('[data-action="move-down"]')?.addEventListener('click', () => moveEntry(root, ctx, 1));

  root.querySelector('[data-action="delete-setting"]')?.addEventListener('click', async () => {
    const entry = selectedEntry();
    if (!entry) return;
    const ids = descendantIds(entries, entry.id);
    const childCount = ids.size - 1;
    const confirmed = await ctx.confirm({
      title: '删除这个词条？',
      message: childCount
        ? `「${entry.title || '未命名词条'}」和它下面的 ${childCount} 个子条目都会被删除。此操作不可撤销。`
        : `「${entry.title || '未命名词条'}」会从设定集里移除。此操作不可撤销。`,
      confirmText: '删除词条',
      danger: true,
    });
    if (!confirmed) return;
    const remaining = entries.filter((item) => !ids.has(item.id));
    novel.settings.entries = remaining;
    state.settingId = entry.parentId || remaining[0]?.id || null;
    state.settingEditing = false;
    propsOpen = false;
    queueSave('settings');
    render(root, ctx, { resetDetail: true });
    toast('词条已删除');
  });

  const titleInput = root.querySelector('#settingTitle');
  titleInput?.addEventListener('input', () => {
    const entry = selectedEntry();
    if (!entry) return;
    entry.title = titleInput.value;
    const label = root.querySelector(`[data-setting-id="${entry.id}"] .tree-item__title`);
    if (label) label.textContent = entry.title || '未命名词条';
    queueSave('settings', 700);
  });

  root.querySelector('#settingAliases')?.addEventListener('input', (event) => {
    const entry = selectedEntry();
    if (!entry) return;
    entry.aliases = parseAliases(event.target.value);
    queueSave('settings', 700);
  });

  const body = root.querySelector('#settingBody');
  if (body) {
    const grow = () => {
      body.style.height = 'auto';
      body.style.height = `${Math.max(320, body.scrollHeight)}px`;
    };
    grow();
    body.addEventListener('input', () => {
      const entry = selectedEntry();
      if (!entry) return;
      entry.body = body.value;
      grow();
      queueSave('settings', 700);
    });
  }
}

function addRoot(root, ctx) {
  const entries = state.novel.settings.entries;
  const entry = makeEntry(entries, null, {
    title: '新的词条',
    kind: '人物',
    color: KINDS.人物.color,
  });
  entries.push(entry);
  state.settingId = entry.id;
  state.settingEditing = true;
  propsOpen = true;
  pendingFocus = 'title';
  queueSave('settings');
  render(root, ctx, { resetDetail: true });
}

function addChild(root, ctx) {
  const entries = state.novel.settings.entries;
  const parent = entries.find((entry) => entry.id === state.settingId);
  if (!parent) return;
  if (depthOf(parent, entries) >= 2) {
    toast('设定集最多支持三级标题', 'info');
    return;
  }
  const entry = makeEntry(entries, parent.id, {
    title: '新的子条目',
    kind: parent.kind === '设定' ? '人物' : parent.kind,
    color: parent.kind === '设定' ? KINDS.人物.color : parent.color,
  });
  entries.push(entry);
  state.settingId = entry.id;
  state.settingEditing = true;
  propsOpen = true;
  pendingFocus = 'title';
  expandAncestors(entry, entries);
  queueSave('settings');
  render(root, ctx, { resetDetail: true });
}

function moveEntry(root, ctx, direction) {
  const entries = state.novel.settings.entries;
  const entry = entries.find((item) => item.id === state.settingId);
  if (!entry) return;
  const siblings = childrenOf(entries, entry.parentId);
  const index = siblings.findIndex((item) => item.id === entry.id);
  const target = siblings[index + direction];
  if (!target) return;
  const a = entry.order || 0;
  const b = target.order || 0;
  entry.order = b;
  target.order = a;
  if (entry.order === target.order) {
    entry.order = index + direction + 1;
    target.order = index + 1;
  }
  queueSave('settings');
  render(root, ctx);
}
