/* 墨夜 · dashboard / 总览 */

import {
  state,
  esc,
  icon,
  coverHTML,
  coverVars,
  formatNumber,
  relativeTime,
  clamp,
  getTemplate,
  stageInfo,
  termEntries,
  todayLabel,
} from '../core.js';

const GOAL_CIRCUMFERENCE = 2 * Math.PI * 54;
const MINI_CIRCUMFERENCE = 2 * Math.PI * 40;

function ring(value, circumference) {
  const offset = circumference * (1 - value / 100);
  return { offset, circumference };
}

export function render(root, ctx) {
  const novel = state.novel;
  if (!novel) return;
  const { meta, outline, settings, drafts } = novel;
  const terms = termEntries(settings.entries);
  const recent = [...drafts]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 4);
  const template = getTemplate(outline.style);
  const progress = meta.goal ? clamp((meta.wordCount / meta.goal) * 100, 0, 100) : 0;
  const remaining = Math.max(0, (meta.goal || 0) - meta.wordCount);
  const cover = coverVars(meta.cover);
  const goalRing = ring(progress, GOAL_CIRCUMFERENCE);
  const miniRing = ring(progress, MINI_CIRCUMFERENCE);
  const latest = recent[0];

  const statCards = [
    { icon: 'feather', color: '#f5c97b', value: formatNumber(meta.wordCount), label: '已写字数' },
    { icon: 'book', color: '#67e8f9', value: String(drafts.length), label: '故事章节' },
    { icon: 'layers', color: '#f472b6', value: String(settings.entries.length), label: '设定词条' },
    { icon: 'list', color: '#b79cff', value: String(outline.beats.length), label: '大纲节拍' },
  ];

  root.innerHTML = `
    <div class="view-scroll scroll-area">
      <div class="dashboard">
        <div class="dashboard__topline">
          <div class="eyebrow eyebrow--plain">WRITING DESK</div>
          <div class="dashboard__date">${esc(todayLabel())}</div>
        </div>

        <section class="hero-card" style="--cover-b:${cover.b}; --cover-c:${cover.c};">
          <div class="hero-card__aura"></div>
          <div class="hero-card__cover">${coverHTML(meta, 'lg')}</div>
          <div class="hero-card__body">
            <div class="eyebrow"><span>${esc(meta.category)}</span> · <span>长篇小说</span></div>
            <h1 class="hero-card__title">${esc(meta.title)}</h1>
            <p class="hero-card__summary">${esc(meta.summary || '故事还没有简介。点“编辑资料”，给它写一句话。')}</p>
            <div class="hero-card__meta">
              <span class="chip"><span class="chip__dot" style="--chip-color:${esc(cover.c)}"></span>${drafts.length} 章</span>
              <span class="chip">${formatNumber(meta.wordCount)} 字</span>
              <span class="chip">最近更新 · ${esc(relativeTime(meta.lastActiveAt || meta.updatedAt))}</span>
            </div>
            <div class="hero-card__actions">
              <button class="primary-btn" type="button" data-action="continue" ${latest ? '' : 'disabled'}>
                ${icon('feather', 15)} ${latest ? '继续写作' : '还没有章节'} ${icon('arrowRight', 14)}
              </button>
              <button class="ghost-btn" type="button" data-action="edit">${icon('edit', 14)} 编辑资料</button>
            </div>
          </div>
          <aside class="hero-card__goal">
            <div class="goal-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <linearGradient id="heroGoal" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style="stop-color:var(--accent-soft)"/>
                    <stop offset="0.55" style="stop-color:var(--accent)"/>
                    <stop offset="1" style="stop-color:var(--accent-2)"/>
                  </linearGradient>
                </defs>
                <circle class="goal-ring__track" cx="60" cy="60" r="54"></circle>
                <circle class="goal-ring__value" cx="60" cy="60" r="54" stroke="url(#heroGoal)"
                  stroke-dasharray="${goalRing.circumference.toFixed(1)}"
                  stroke-dashoffset="${goalRing.offset.toFixed(1)}"></circle>
              </svg>
              <div class="goal-ring__inner">
                <span class="goal-ring__number">${progress.toFixed(progress >= 10 ? 0 : 1)}%</span>
                <span class="goal-ring__unit">COMPLETED</span>
              </div>
            </div>
            <div class="goal-caption">
              ${meta.goal ? `目标 <strong>${formatNumber(meta.goal)}</strong> 字<br>还差 <strong>${formatNumber(remaining)}</strong> 字` : '还没有设置目标'}
            </div>
          </aside>
        </section>

        <section class="dashboard-stats">
          ${statCards
            .map(
              (item) => `<div class="stat-card" style="--stat-color:${item.color}">
                <span class="stat-card__icon">${icon(item.icon, 15)}</span>
                <div><div class="stat-card__value">${item.value}</div><div class="stat-card__label">${item.label}</div></div>
              </div>`,
            )
            .join('')}
        </section>

        <div class="dash-grid">
          <div class="dash-column">
            <section class="panel">
              <header class="panel__head">
                <div class="panel__title">${icon('book', 15)} 最近章节</div>
                <button class="text-btn" type="button" data-view="drafts">全部章节 ${icon('arrowRight', 12)}</button>
              </header>
              ${
                recent.length
                  ? `<div class="recent-list">
                      ${recent
                        .map((draft, index) => {
                          const number = String(draft.order || index + 1).padStart(2, '0');
                          return `<button class="recent-row" type="button" data-draft="${esc(draft.id)}">
                            <span class="recent-row__no">${number}</span>
                            <span class="recent-row__body">
                              <span class="recent-row__title">${esc(draft.title || '未命名章节')}</span>
                              <span class="recent-row__meta">${formatNumber(draft.wordCount || 0)} 字 · ${esc(relativeTime(draft.updatedAt))}</span>
                            </span>
                            <span class="recent-row__arrow">${icon('arrowRight', 14)}</span>
                          </button>`;
                        })
                        .join('')}
                    </div>`
                  : `<div class="recent-empty">还没有章节。打开正文，写下第一句话。</div>`
              }
            </section>

            <section class="panel outline-panel">
              <header class="panel__head">
                <div class="panel__title">${icon('list', 15)} 故事骨架 <span class="badge">${esc(template.name)}</span></div>
                <button class="text-btn" type="button" data-view="outline">打开大纲 ${icon('arrowRight', 12)}</button>
              </header>
              ${
                outline.beats.length
                  ? `<div class="outline-rail scroll-area">
                      ${outline.beats
                        .slice(0, 5)
                        .map((beat) => {
                          const stage = stageInfo(outline.style, beat.stage);
                          return `<button class="mini-beat" type="button" data-view="outline" style="--stage-color:${stage.color}">
                            <span class="mini-beat__stage"><span class="beat-card__no">${icon('dot', 7)}</span>${esc(stage.name)}</span>
                            <div class="mini-beat__title">${esc(beat.title || '未命名节拍')}</div>
                            <div class="mini-beat__summary">${esc(beat.summary || '还没有写下这一幕的内容。')}</div>
                          </button>`;
                        })
                        .join('')}
                    </div>`
                  : `<div class="outline-empty">故事还没有骨架，去大纲页套用一个简单模板。</div>`
              }
            </section>
          </div>

          <div class="dash-column dash-column--side">
            <section class="panel goal-panel">
              <div class="goal-panel__top">
                <div class="panel__title">${icon('target', 15)} 写作目标</div>
                <span class="badge">${progress.toFixed(0)}%</span>
              </div>
              <div class="goal-panel__body">
                <div class="goal-panel__figure">
                  <svg viewBox="0 0 96 96" aria-hidden="true">
                    <defs>
                      <linearGradient id="miniGoal" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" style="stop-color:var(--accent)"/>
                        <stop offset="0.55" style="stop-color:var(--accent-2)"/>
                        <stop offset="1" style="stop-color:var(--accent-soft)"/>
                      </linearGradient>
                    </defs>
                    <circle class="goal-ring__track" cx="48" cy="48" r="40"></circle>
                    <circle class="goal-ring__value" cx="48" cy="48" r="40" stroke="url(#miniGoal)"
                      stroke-dasharray="${miniRing.circumference.toFixed(1)}"
                      stroke-dashoffset="${miniRing.offset.toFixed(1)}"></circle>
                  </svg>
                  <div class="goal-panel__number">${progress.toFixed(0)}<small style="font-size:10px">%</small></div>
                </div>
                <div class="goal-panel__info">
                  <span class="goal-panel__label">当前进度</span>
                  <span class="goal-panel__words">${formatNumber(meta.wordCount)} / ${formatNumber(meta.goal)}</span>
                  <span class="goal-panel__left">${remaining ? `还差 ${formatNumber(remaining)} 字，慢慢写。` : '目标达成，故事还在继续。'}</span>
                </div>
              </div>
              <div class="mini-progress"><span style="width:${progress}%"></span></div>
            </section>

            <section class="panel palette-panel">
              <header class="panel__head">
                <div class="panel__title">${icon('palette', 15)} 词条色卡 <span class="badge">${terms.length}</span></div>
                <button class="text-btn" type="button" data-view="settings">设定集 ${icon('arrowRight', 12)}</button>
              </header>
              ${
                terms.length
                  ? `<div class="palette-list">
                      ${terms
                        .slice(0, 6)
                        .map(
                          (entry) => `<button class="palette-row" type="button" data-setting="${esc(entry.id)}">
                            <span class="palette-row__dot" style="--term-color:${esc(entry.color)}"></span>
                            <span class="palette-row__name">${esc(entry.title)}</span>
                            <span class="palette-row__kind">${esc(entry.kind || '设定')}</span>
                          </button>`,
                        )
                        .join('')}
                    </div>`
                  : `<div class="palette-empty">还没有会上色的词条。<br>在设定集里添加人物或地点，名字就会在正文里拥有自己的颜色。
                      <div><button class="primary-btn btn-sm" type="button" data-view="settings">${icon('plus', 13)} 添加第一个词条</button></div>
                    </div>`
              }
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => ctx.setView(button.dataset.view));
  });
  root.querySelectorAll('[data-draft]').forEach((button) => {
    button.addEventListener('click', () => ctx.openDraft(button.dataset.draft, true));
  });
  root.querySelectorAll('[data-setting]').forEach((button) => {
    button.addEventListener('click', () => ctx.openSetting(button.dataset.setting));
  });
  root.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
    if (latest) ctx.openDraft(latest.id, true);
  });
  root.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
    ctx.openNovelModal('edit');
  });
}
