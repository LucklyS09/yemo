/* 墨夜 · outline / 故事骨架 */

import {
  state,
  esc,
  icon,
  uid,
  countWords,
  getTemplate,
  stageInfo,
  OUTLINE_TEMPLATES,
  toast,
} from '../core.js';
import { queueSave } from '../store.js';

function autosize(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(44, textarea.scrollHeight)}px`;
}

function autosizeAll(root) {
  root.querySelectorAll('.beat-summary').forEach(autosize);
}

function beatCard(beat, index, template) {
  const stage = stageInfo(template.id, beat.stage);
  const known = template.columns.some((column) => column.id === beat.stage);
  const options = template.columns
    .map(
      (column) =>
        `<option value="${esc(column.id)}" ${column.id === beat.stage ? 'selected' : ''}>${esc(column.name)}</option>`,
    )
    .join('');
  return `<article class="beat-card" data-beat="${esc(beat.id)}" style="--stage-color:${stage.color}">
    <div class="beat-card__top">
      <span class="beat-card__no">${String(index + 1).padStart(2, '0')}</span>
      <select class="beat-stage" data-field="stage" aria-label="所属幕次">
        ${known ? '' : `<option value="${esc(beat.stage)}" selected>未分幕</option>`}
        ${options}
      </select>
      <button class="beat-card__delete" type="button" data-action="delete-beat" aria-label="删除节拍">${icon('trash', 13)}</button>
    </div>
    <input class="beat-title" data-field="title" value="${esc(beat.title || '')}" placeholder="这一幕叫什么？" aria-label="节拍标题">
    <textarea class="beat-summary" data-field="summary" placeholder="发生了什么？谁改变了？" aria-label="节拍内容">${esc(beat.summary || '')}</textarea>
    <div class="beat-card__foot">
      <span>${esc(stage.name)}${stage.sub ? ` · ${esc(stage.sub)}` : ''}</span>
      <span>${countWords(beat.summary || '')} 字</span>
    </div>
  </article>`;
}

function columnHTML(column, beats, allBeats, template) {
  return `<section class="outline-column" style="--stage-color:${column.color}">
    <header class="outline-column__head">
      <span class="outline-column__dot"></span>
      <span class="outline-column__name">${esc(column.name)}</span>
      <span class="outline-column__sub">${esc(column.sub || '')}</span>
      <span class="outline-column__count">${String(beats.length).padStart(2, '0')}</span>
    </header>
    <div class="outline-column__body">
      ${beats.map((beat) => beatCard(beat, allBeats.indexOf(beat), template)).join('')}
      ${column.orphan ? '' : `<button class="beat-add" type="button" data-add-stage="${esc(column.id)}">${icon('plus', 12)} 添加节拍</button>`}
    </div>
  </section>`;
}

function boardHTML(outline) {
  const template = getTemplate(outline.style);
  const beats = outline.beats;
  if (!beats.length) {
    return `<div class="outline-empty-board">
      <span class="empty-state__icon">${icon('list', 24)}</span>
      <strong>先给故事搭一个简单的骨架</strong>
      <span>不用写得完整。把“开场、变化、代价、结局”先放在该在的位置，之后随时可以改。</span>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;justify-content:center">
        <button class="primary-btn btn-sm" type="button" data-action="inspire">${icon('sparkle', 13)} 套用「${esc(template.name)}」</button>
        <button class="ghost-btn btn-sm" type="button" data-action="add-beat">${icon('plus', 13)} 写一张空白卡</button>
      </div>
    </div>`;
  }

  if (template.layout === 'grid') {
    return `<div class="outline-grid">
      ${beats.map((beat, index) => beatCard(beat, index, template)).join('')}
    </div>
    <div class="outline-grid-foot">
      <button class="beat-add" type="button" data-action="add-beat">${icon('plus', 12)} 添加一张灵感卡</button>
    </div>`;
  }

  if (template.layout === 'timeline') {
    const groups = template.columns
      .map((column) => {
        const items = beats.filter((beat) => beat.stage === column.id);
        return `<section class="timeline-group" style="--stage-color:${column.color}">
          <div class="timeline-group__head">
            <span class="timeline-group__name">${esc(column.name)}</span>
            <span class="timeline-group__sub">${esc(column.sub || '')}</span>
            <span class="timeline-group__count">${String(items.length).padStart(2, '0')}</span>
          </div>
          <div class="timeline-group__cards">
            ${items.map((beat) => beatCard(beat, beats.indexOf(beat), template)).join('')}
            <button class="beat-add" type="button" data-add-stage="${esc(column.id)}">${icon('plus', 12)} 添加</button>
          </div>
        </section>`;
      })
      .join('');
    return `<div class="outline-timeline">${groups}</div>`;
  }

  const known = new Set(template.columns.map((column) => column.id));
  const orphans = beats.filter((beat) => !known.has(beat.stage));
  const columns = template.columns.map((column) =>
    columnHTML(
      column,
      beats.filter((beat) => beat.stage === column.id),
      beats,
      template,
    ),
  );
  if (orphans.length) {
    columns.push(
      columnHTML(
        { id: 'unassigned', name: '未分幕', sub: '等待归位', color: '#8f8a99', orphan: true },
        orphans,
        beats,
        template,
      ),
    );
  }
  return `<div class="outline-columns" style="--col-count:${columns.length}">${columns.join('')}</div>`;
}

export function render(root, ctx) {
  const novel = state.novel;
  if (!novel) return;
  const outline = novel.outline;
  const template = getTemplate(outline.style);

  root.innerHTML = `<div class="outline-view scroll-area">
    <div class="view-head">
      <div class="view-head__copy">
        <div class="eyebrow">STORY OUTLINE</div>
        <h2 class="view-head__title">故事骨架</h2>
        <p class="view-head__sub">不用复杂。先把关键的几步放好，再边写边改。</p>
      </div>
      <div class="view-head__actions">
        <div class="template-switch" role="group" aria-label="大纲样式">
          ${OUTLINE_TEMPLATES.map(
            (item) => `<button class="template-btn ${item.id === template.id ? 'is-active' : ''}" type="button" data-template="${item.id}" title="${esc(item.label)}">
              ${icon(item.icon, 13)} ${esc(item.name)}
            </button>`,
          ).join('')}
        </div>
        <button class="ghost-btn btn-sm" type="button" data-action="inspire">${icon('sparkle', 13)} 载入灵感</button>
      </div>
    </div>
    <div class="outline-hint">
      ${icon('info', 12)}
      <span>${esc(template.name)} · ${outline.beats.length} 个节拍 · 卡片内容随时可以改，不必一次写完。</span>
    </div>
    <div class="outline-board">${boardHTML(outline)}</div>
  </div>`;

  autosizeAll(root);
  const outlineView = root.querySelector('.outline-view');

  const rerender = () => render(root, ctx);
  const currentBeat = (event) => {
    const card = event.target.closest('[data-beat]');
    if (!card) return null;
    return {
      card,
      beat: outline.beats.find((item) => item.id === card.dataset.beat),
    };
  };

  root.querySelectorAll('[data-template]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextId = button.dataset.template;
      if (nextId === outline.style) return;
      const next = getTemplate(nextId);
      const old = getTemplate(outline.style);
      if (outline.beats.length) {
        const confirmed = await ctx.confirm({
          title: `切换为「${next.name}」？`,
          message: `现有 ${outline.beats.length} 个节拍会保留，并按原来的幕次顺序放进新的结构。文字不会丢失。`,
          confirmText: '切换样式',
        });
        if (!confirmed) return;
        outline.beats.forEach((beat) => {
          const index = old.columns.findIndex((column) => column.id === beat.stage);
          const column = next.columns[Math.max(0, Math.min(index < 0 ? 0 : index, next.columns.length - 1))];
          beat.stage = column.id;
        });
      }
      outline.style = nextId;
      queueSave('outline');
      rerender();
      toast(`已切换为「${next.name}」`);
    });
  });

  const addBeat = (stageId) => {
    const stage = stageId || template.columns[0].id;
    const beat = {
      id: uid('b'),
      stage,
      title: '未命名节拍',
      summary: '',
    };
    outline.beats.push(beat);
    queueSave('outline');
    rerender();
    const input = root.querySelector(`[data-beat="${beat.id}"] .beat-title`);
    if (input) {
      input.focus();
      input.select();
    }
  };

  root.querySelectorAll('[data-action="add-beat"]').forEach((button) =>
    button.addEventListener('click', () => addBeat()),
  );
  root.querySelectorAll('[data-add-stage]').forEach((button) =>
    button.addEventListener('click', () => addBeat(button.dataset.addStage)),
  );

  root.querySelectorAll('[data-action="inspire"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (outline.beats.length) {
        const confirmed = await ctx.confirm({
          title: '载入模板灵感？',
          message: `会在现有大纲后面追加 ${template.starters.length} 个提示节拍，原来的内容保留。之后可以随意删改。`,
          confirmText: '载入灵感',
        });
        if (!confirmed) return;
      }
      template.starters.forEach((starter) => {
        outline.beats.push({
          id: uid('b'),
          stage: starter.stage,
          title: starter.title,
          summary: starter.summary || '',
        });
      });
      queueSave('outline');
      rerender();
      toast(`已放入 ${template.starters.length} 个节拍`, 'success', 'sparkle');
    });
  });

  outlineView.addEventListener('input', (event) => {
    const target = event.target;
    const field = target.dataset.field;
    if (!field) return;
    const found = currentBeat(event);
    if (!found?.beat) return;
    if (field === 'title' || field === 'summary') {
      found.beat[field] = target.value;
      if (field === 'summary') {
        autosize(target);
        const count = found.card.querySelector('.beat-card__foot span:last-child');
        if (count) count.textContent = `${countWords(target.value)} 字`;
      }
      queueSave('outline', 700);
    }
  });

  outlineView.addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'stage') return;
    const found = currentBeat(event);
    if (!found?.beat) return;
    found.beat.stage = event.target.value;
    queueSave('outline');
    rerender();
  });

  outlineView.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="delete-beat"]');
    if (!button) return;
    const found = currentBeat(event);
    if (!found?.beat) return;
    const name = found.beat.title?.trim() || '这个节拍';
    const confirmed = await ctx.confirm({
      title: '删掉这个节拍？',
      message: `「${name}」会从大纲里移除。如果它只是一张空卡，也可以直接删掉。`,
      confirmText: '删除节拍',
      danger: true,
    });
    if (!confirmed) return;
    outline.beats = outline.beats.filter((item) => item.id !== found.beat.id);
    queueSave('outline');
    rerender();
  });

  outlineView.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.classList.contains('beat-title')) {
      event.preventDefault();
      event.target.blur();
    }
  });
}
