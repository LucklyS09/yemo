/* 墨夜 · drafts / 正文编辑器 */

import {
  state,
  api,
  esc,
  icon,
  countWords,
  formatNumber,
  relativeTime,
  termEntries,
  toast,
} from '../core.js';
import { queueSave, saveNow, applyStats } from '../store.js';
import { applyTermHighlights } from '../highlight.js';

let appearanceHandler = null;

function chapterNumber(draft, index) {
  return String(draft.order || index + 1).padStart(2, '0');
}

function plainFromHTML(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  return holder.innerText || holder.textContent || '';
}

export function render(root, ctx) {
  const novel = state.novel;
  if (!novel) return;

  if (!novel.drafts.length) {
    root.innerHTML = `<div class="view-scroll">
      <div class="empty-state">
        <span class="empty-state__icon">${icon('feather', 24)}</span>
        <div class="empty-state__title">这一本还没有章节</div>
        <div class="empty-state__text">新建一章，写下第一句话。正文会自动保存在本地文件夹里。</div>
        <button class="primary-btn" type="button" data-action="new-draft">${icon('plus', 14)} 新建第一章</button>
      </div>
    </div>`;
    root.querySelector('[data-action="new-draft"]')?.addEventListener('click', () => createChapter(root, ctx));
    return;
  }

  const drafts = [...novel.drafts].sort((a, b) => (a.order || 0) - (b.order || 0));
  const draft = drafts.find((item) => item.id === state.draftId) || drafts[0];
  state.draftId = draft.id;
  const terms = termEntries(novel.settings.entries);
  const number = chapterNumber(draft, drafts.indexOf(draft));
  const auto = novel.meta.autoHighlight !== false;

  root.innerHTML = `<div class="drafts-view">
    <aside class="draft-sidebar">
      <div class="draft-sidebar__head">
        <div class="draft-sidebar__title"><strong>章节</strong><span>${String(drafts.length).padStart(2, '0')}</span></div>
        <button class="icon-btn" type="button" data-action="new-draft" title="新建章节" style="width:28px;height:28px">${icon('plus', 15)}</button>
      </div>
      <div class="draft-list scroll-area">
        ${drafts
          .map(
            (item, index) => `<button class="draft-item ${item.id === draft.id ? 'is-active' : ''}" type="button" data-draft-id="${esc(item.id)}">
              <span class="draft-item__no">${chapterNumber(item, index)}</span>
              <span class="draft-item__body">
                <span class="draft-item__title">${esc(item.title || '未命名章节')}</span>
                <span class="draft-item__meta">
                  <span data-word-for="${esc(item.id)}">${formatNumber(item.wordCount || 0)} 字</span>
                  <i></i>
                  <span>${esc(relativeTime(item.updatedAt))}</span>
                </span>
              </span>
            </button>`,
          )
          .join('')}
      </div>
      <div class="draft-sidebar__foot">
        <button class="draft-sidebar__new" type="button" data-action="new-draft">${icon('plus', 13)} 新建章节</button>
      </div>
    </aside>

    <section class="draft-main">
      <header class="draft-head">
        <div class="draft-head__main">
          <div class="draft-kicker"><span class="draft-kicker__dot"></span>CHAPTER ${number} · DRAFT</div>
          <input class="draft-title-input" id="draftTitle" value="${esc(draft.title || '')}" placeholder="未命名章节" aria-label="章节标题">
          <div class="draft-meta">
            <span class="draft-meta__count" id="draftWordCount">${formatNumber(draft.wordCount || 0)} 字</span>
            <i></i>
            <span>上次修改 ${esc(relativeTime(draft.updatedAt))}</span>
            <i></i>
            <span>自动保存</span>
          </div>
        </div>
        <div class="draft-head__actions">
          <button class="auto-mark-toggle ${auto ? 'is-on' : ''}" type="button" data-action="toggle-mark" aria-pressed="${auto}" title="让设定里的名字自动带上颜色">
            ${icon('sparkle', 13)}<span>词条上色</span>
          </button>
          <button class="icon-btn" type="button" data-action="focus" title="专注模式（Esc 退出）">${icon('focus', 16)}</button>
          <button class="icon-btn icon-btn--danger" type="button" data-action="delete-draft" title="删除本章">${icon('trash', 15)}</button>
        </div>
      </header>

      <div class="term-legend" id="termLegend">
        <span class="term-legend__label" title="点击色卡里的名字，或 Ctrl/Cmd + 点击正文中的名字，查看设定">${icon('palette', 11)} 词条色卡</span>
        ${
          terms.length
            ? terms
                .map(
                  (entry) => `<button class="term-chip" type="button" data-setting-id="${esc(entry.id)}" style="--term-color:${esc(entry.color)}" title="查看设定：${esc(
                    [entry.title, ...(entry.aliases || [])].join(' / '),
                  )}"><span class="term-chip__dot"></span>${esc(entry.title)}</button>`,
                )
                .join('')
            : `<span class="term-legend__empty">设定集里还没有词条，<button type="button" data-go-settings>去添加名字</button></span>`
        }
      </div>

      <div class="editor-scroll scroll-area" id="editorScroll">
        <div class="editor-page">
          <div class="editor-page__watermark">${number}</div>
          <div class="draft-editor" id="draftEditor" contenteditable="plaintext-only" spellcheck="false" data-placeholder="从这一句开始……" aria-label="章节正文" role="textbox" aria-multiline="true" title="Ctrl/Cmd + 点击名字查看设定"></div>
        </div>
        <div class="editor-foot">
          <div class="editor-foot__left">${icon('save', 11)} 自动保存在本地 <span id="termHitCount"></span></div>
          <div>${icon('feather', 11)} ${formatNumber(draft.wordCount || 0)} 字</div>
        </div>
      </div>
    </section>
  </div>`;

  const editor = root.querySelector('#draftEditor');
  const draftView = root.querySelector('.drafts-view');
  const editorScroll = root.querySelector('#editorScroll');
  const titleInput = root.querySelector('#draftTitle');
  let highlightTimer = null;

  const initialText = draft.plain && draft.plain.trim() ? draft.plain : plainFromHTML(draft.content);
  editor.textContent = initialText;
  const refreshEmpty = () => {
    const empty = !editor.innerText.replace(/\u200b/g, '').trim();
    editor.classList.toggle('is-empty', empty);
  };
  refreshEmpty();

  const applyHighlights = (force = false) => {
    if (!editor.isConnected) return;
    const supports = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
    if (!supports && editor === document.activeElement && !force) return;
    const count = applyTermHighlights(editor, novel.settings.entries, novel.meta.autoHighlight !== false);
    const hit = root.querySelector('#termHitCount');
    if (hit) {
      hit.textContent = count > 0 ? `· ${count} 处名字已上色` : '';
    }
  };

  applyHighlights(true);

  if (appearanceHandler) document.removeEventListener('ink:appearance', appearanceHandler);
  appearanceHandler = () => {
    if (editor.isConnected) applyHighlights(true);
  };
  document.addEventListener('ink:appearance', appearanceHandler);

  const scheduleHighlight = () => {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => applyHighlights(false), 220);
  };

  const refreshNumbers = () => {
    const plain = editor.innerText;
    draft.plain = plain;
    draft.wordCount = countWords(plain);
    const count = root.querySelector('#draftWordCount');
    if (count) count.textContent = `${formatNumber(draft.wordCount)} 字`;
    const row = root.querySelector(`[data-word-for="${draft.id}"]`);
    if (row) row.textContent = `${formatNumber(draft.wordCount)} 字`;
    const footCount = root.querySelector('.editor-foot > div:last-child');
    if (footCount) footCount.innerHTML = `${icon('feather', 11)} ${formatNumber(draft.wordCount)} 字`;
  };

  const commitEditor = (immediate = false) => {
    draft.content = editor.innerHTML;
    draft.plain = editor.innerText;
    draft.wordCount = countWords(draft.plain);
    draft.updatedAt = new Date().toISOString();
    refreshEmpty();
    refreshNumbers();
    queueSave(`draft:${draft.id}`, immediate ? 120 : 550);
    scheduleHighlight();
  };

  editor.addEventListener('input', () => commitEditor(false));
  editor.addEventListener('blur', () => applyHighlights(true));
  editor.addEventListener('click', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const position = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!position || !editor.contains(position.startContainer)) return;
    const node = position.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const offset = position.startOffset;
    const text = node.nodeValue || '';
    const entry = novel.settings.entries.find((item) => {
      const terms = [item.title, ...(item.aliases || [])]
        .map((term) => String(term || '').trim())
        .filter(Boolean);
      return terms.some((term) => {
        let index = text.indexOf(term);
        while (index >= 0) {
          if (offset >= index && offset <= index + term.length) return true;
          index = text.indexOf(term, index + 1);
        }
        return false;
      });
    });
    if (entry) {
      event.preventDefault();
      ctx.openSetting(entry.id);
    }
  });
  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    document.execCommand('insertText', false, text);
    commitEditor(false);
  });
  editor.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (['b', 'i', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
  });

  root.querySelector('[data-action="toggle-mark"]')?.addEventListener('click', () => {
    novel.meta.autoHighlight = novel.meta.autoHighlight === false;
    queueSave('meta');
    const button = root.querySelector('[data-action="toggle-mark"]');
    button.classList.toggle('is-on', novel.meta.autoHighlight);
    button.setAttribute('aria-pressed', String(novel.meta.autoHighlight));
    if (!novel.meta.autoHighlight) {
      applyTermHighlights(editor, novel.settings.entries, false);
      root.querySelector('#termHitCount').textContent = '';
    } else {
      applyHighlights(true);
    }
    toast(novel.meta.autoHighlight ? '词条自动上色已打开' : '词条自动上色已关闭', 'info', 'sparkle');
  });

  root.querySelectorAll('.term-chip[data-setting-id]').forEach((button) => {
    button.addEventListener('click', () => ctx.openSetting(button.dataset.settingId));
  });

  root.querySelector('[data-go-settings]')?.addEventListener('click', () => ctx.setView('settings'));

  root.querySelectorAll('[data-draft-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.dataset.draftId === draft.id) return;
      await saveNow();
      state.draftId = button.dataset.draftId;
      state.focusEditor = true;
      render(root, ctx);
    });
  });

  root.querySelectorAll('[data-action="new-draft"]').forEach((button) => {
    button.addEventListener('click', () => createChapter(root, ctx));
  });

  root.querySelector('[data-action="delete-draft"]')?.addEventListener('click', async () => {
    if (novel.drafts.length <= 1) {
      toast('至少保留一章。想重写的话，先新建一章再删旧的。', 'info');
      return;
    }
    const confirmed = await ctx.confirm({
      title: '删除这一章？',
      message: `「${draft.title || '未命名章节'}」和它里面的 ${formatNumber(draft.wordCount || 0)} 字都会从本地删除，无法撤销。`,
      confirmText: '删除章节',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await saveNow();
      const result = await api.deleteDraft(novel.meta.id, draft.id);
      novel.drafts = novel.drafts.filter((item) => item.id !== draft.id);
      applyStats(novel, result?.stats);
      const next = [...novel.drafts].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      state.draftId = next?.id || null;
      state.focusEditor = false;
      render(root, ctx);
      toast('章节已删除');
    } catch (error) {
      toast(error.message || '删除失败', 'error');
    }
  });

  root.querySelector('[data-action="focus"]')?.addEventListener('click', () => {
    const on = document.body.classList.toggle('is-focus');
    if (on) {
      editor.focus({ preventScroll: true });
      toast('专注模式 · 按 Esc 退出', 'info', 'focus');
    }
  });

  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    draft.updatedAt = new Date().toISOString();
    const row = root.querySelector(`[data-draft-id="${draft.id}"] .draft-item__title`);
    if (row) row.textContent = draft.title || '未命名章节';
    queueSave(`draft:${draft.id}`, 700);
  });

  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });

  draftView?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNow().then((ok) => {
        toast(ok ? '已保存' : '保存失败，请检查本地服务', ok ? 'success' : 'error');
      });
    }
  });
  if (state.focusEditor) {
    state.focusEditor = false;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    if (editorScroll) editorScroll.scrollTop = 0;
  }
}

async function createChapter(root, ctx) {
  const novel = state.novel;
  if (!novel) return;
  try {
    await saveNow();
    const maxOrder = novel.drafts.length ? Math.max(...novel.drafts.map((draft) => draft.order || 0)) : 0;
    const order = maxOrder + 1;
    const result = await api.createDraft(novel.meta.id, {
      title: `第${order}章 未命名`,
      content: '',
      plain: '',
    });
    if (!result?.draft) throw new Error('创建章节失败');
    novel.drafts.push(result.draft);
    applyStats(novel, result.stats);
    state.draftId = result.draft.id;
    state.focusEditor = true;
    render(root, ctx);
    toast('新章节已建好');
  } catch (error) {
    toast(error.message || '创建章节失败', 'error');
  }
}
