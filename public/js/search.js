/* 墨夜 · 全局搜索（Ctrl/Cmd + K） */

import { state, esc, icon, openModal, formatNumber } from './core.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mark(text, query) {
  const safe = esc(text);
  if (!query) return safe;
  return safe.replace(new RegExp(escapeRegExp(query), 'ig'), (match) => `<mark>${esc(match)}</mark>`);
}

function snippet(text, query, radius = 54) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const index = source.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return source.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + query.length + radius);
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
}

function findRange(root, query) {
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue || '';
    const index = value.toLowerCase().indexOf(needle);
    if (index >= 0 && !startNode) {
      startNode = node;
      startOffset = index;
      const remaining = query.length - (value.length - index);
      if (remaining <= 0) {
        endNode = node;
        endOffset = index + query.length;
      } else {
        // The query spans a formatting boundary; walk forward to find the end.
        let consumed = value.length - index;
        let next = walker.nextNode();
        while (next) {
          const nextValue = next.nodeValue || '';
          if (consumed + nextValue.length >= query.length) {
            endNode = next;
            endOffset = query.length - consumed;
            break;
          }
          consumed += nextValue.length;
          next = walker.nextNode();
        }
      }
      if (startNode && endNode) break;
    }
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function jumpToDraft(ctx, draftId, query, close) {
  close();
  ctx.openDraft(draftId, true);
  setTimeout(() => {
    const editor = document.querySelector('#draftEditor');
    if (!editor) return;
    const range = findRange(editor, query);
    if (!range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = range.getBoundingClientRect();
    if (rect) {
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, 90);
}

export function openSearch(ctx) {
  const novel = state.novel;
  if (!novel) return;

  const modal = openModal({
    title: '搜索',
    eyebrow: 'FIND IN THIS BOOK',
    size: 'lg',
    body: `<div class="global-search">
      <div class="global-search__field">${icon('search', 16)}<input id="globalSearchInput" type="search" autocomplete="off" placeholder="搜章节、词条、别名、大纲……" aria-label="全书搜索"></div>
      <div class="global-search__results" id="globalSearchResults">
        <div class="global-search__hint">输入关键词开始搜索。全书正文、设定和大纲都会一起查。</div>
      </div>
      <div class="global-search__foot"><span>↑↓ 选择 · Enter 打开 · Esc 关闭</span><span>${esc(novel.meta.title)}</span></div>
    </div>`,
    onMount(panel, close) {
      const input = panel.querySelector('#globalSearchInput');
      const output = panel.querySelector('#globalSearchResults');
      let results = [];
      let active = 0;

      const collect = (query) => {
        const q = query.trim();
        if (!q) return [];
        const lower = q.toLowerCase();
        const items = [];

        for (const draft of novel.drafts) {
          const title = draft.title || '未命名章节';
          const text = draft.plain || '';
          if (title.toLowerCase().includes(lower) || text.toLowerCase().includes(lower)) {
            items.push({
              kind: 'draft',
              kindLabel: '正文',
              id: draft.id,
              title,
              meta: `${formatNumber(draft.wordCount || 0)} 字`,
              text: text.toLowerCase().includes(lower) ? snippet(text, q) : '在章节标题中找到',
              titleHit: title.toLowerCase().includes(lower),
            });
          }
        }

        for (const entry of novel.settings.entries) {
          const aliases = (entry.aliases || []).join('、');
          const hay = `${entry.title || ''} ${aliases} ${entry.body || ''}`.toLowerCase();
          if (!hay.includes(lower)) continue;
          items.push({
            kind: 'setting',
            kindLabel: '设定',
            id: entry.id,
            title: entry.title || '未命名词条',
            meta: `${entry.kind || '设定'}${aliases ? ` · ${aliases}` : ''}`,
            text: (entry.body || '').toLowerCase().includes(lower) ? snippet(entry.body, q) : '在词条名或别名中找到',
            titleHit: `${entry.title || ''} ${aliases}`.toLowerCase().includes(lower),
          });
        }

        for (const beat of novel.outline.beats || []) {
          const hay = `${beat.title || ''} ${beat.summary || ''}`.toLowerCase();
          if (!hay.includes(lower)) continue;
          items.push({
            kind: 'outline',
            kindLabel: '大纲',
            id: beat.id,
            title: beat.title || '未命名节拍',
            meta: beat.stage || '节拍',
            text: (beat.summary || '').toLowerCase().includes(lower) ? snippet(beat.summary, q) : '在大纲标题中找到',
            titleHit: (beat.title || '').toLowerCase().includes(lower),
          });
        }

        return items.sort((a, b) => Number(b.titleHit) - Number(a.titleHit)).slice(0, 18);
      };

      const activate = (result) => {
        if (!result) return;
        if (result.kind === 'draft') {
          jumpToDraft(ctx, result.id, input.value.trim(), close);
        } else if (result.kind === 'setting') {
          close();
          ctx.openSetting(result.id);
        } else {
          close();
          ctx.setView('outline');
          setTimeout(() => {
            const card = document.querySelector(`[data-beat="${CSS.escape(result.id)}"]`);
            if (!card) return;
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            card.classList.add('is-search-hit');
            setTimeout(() => card.classList.remove('is-search-hit'), 1600);
          }, 70);
        }
      };

      const render = () => {
        const query = input.value.trim();
        results = collect(query);
        active = 0;
        if (!query) {
          output.innerHTML = '<div class="global-search__hint">输入关键词开始搜索。全书正文、设定和大纲都会一起查。</div>';
          return;
        }
        if (!results.length) {
          output.innerHTML = `<div class="global-search__empty">没有找到「${esc(query)}」。<br>试试少几个字，或者搜某个角色名、地点名。</div>`;
          return;
        }
        output.innerHTML = results
          .map(
            (item, index) => `<button class="search-result ${index === 0 ? 'is-active' : ''}" type="button" data-result-index="${index}">
              <span class="search-result__kind">${esc(item.kindLabel)}</span>
              <span class="search-result__copy">
                <span class="search-result__title">${mark(item.title, query)}<em>${esc(item.meta)}</em></span>
                <span class="search-result__snippet">${mark(item.text, query)}</span>
              </span>
            </button>`,
          )
          .join('');
        output.querySelectorAll('[data-result-index]').forEach((button) => {
          button.addEventListener('click', () => activate(results[Number(button.dataset.resultIndex)]));
        });
      };

      const move = (direction) => {
        if (!results.length) return;
        active = (active + direction + results.length) % results.length;
        output.querySelectorAll('.search-result').forEach((button, index) => {
          button.classList.toggle('is-active', index === active);
        });
        output.querySelectorAll('.search-result')[active]?.scrollIntoView({ block: 'nearest' });
      };

      input.addEventListener('input', render);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          activate(results[active]);
        }
      });
      requestAnimationFrame(() => input.focus());
    },
  });
  return modal;
}
