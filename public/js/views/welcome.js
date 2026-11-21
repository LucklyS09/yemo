/* 墨夜 · welcome / 空书架 */

import { state, esc, icon } from '../core.js';

export function render(root, ctx) {
  const recent = state.library.novels[0];
  root.innerHTML = `<div class="welcome">
    <div class="welcome__inner">
      <div class="welcome__mark">
        <span class="brand-emblem"><span></span></span>
      </div>
      <div class="eyebrow welcome__eyebrow">A QUIET PLACE FOR STORIES</div>
      <h1 class="welcome__title">把故事，<span class="gradient-text">写进夜里。</span></h1>
      <p class="welcome__sub">一个只属于你的小说创作空间。大纲、设定和正文都收在本地文件夹里，名字会在正文中拥有自己的颜色。</p>
      <div class="welcome__actions">
        <button class="primary-btn" type="button" data-action="create">${icon('plus', 15)} 新建一部小说</button>
        ${
          recent
            ? `<button class="ghost-btn" type="button" data-open-novel="${esc(recent.id)}">${icon('book', 14)} 打开《${esc(recent.title)}》</button>`
            : ''
        }
      </div>

      <div class="welcome__features">
        <div class="welcome-feature" style="--feature-color:#67e8f9">
          <span class="welcome-feature__icon">${icon('list', 17)}</span>
          <div class="welcome-feature__title">简单的大纲</div>
          <div class="welcome-feature__text">三幕、起承转合、时间线，或干脆自由卡片。不强迫你按规矩来。</div>
        </div>
        <div class="welcome-feature" style="--feature-color:#f472b6">
          <span class="welcome-feature__icon">${icon('layers', 17)}</span>
          <div class="welcome-feature__title">会长颜色的设定集</div>
          <div class="welcome-feature__text">人物、地点、物件分三级标题整理。写进正文时，名字自动带上专属颜色。</div>
        </div>
        <div class="welcome-feature" style="--feature-color:#f5c97b">
          <span class="welcome-feature__icon">${icon('feather', 17)}</span>
          <div class="welcome-feature__title">像纸，又比纸漂亮</div>
          <div class="welcome-feature__text">黑色阅读界面、可调的文字颜色与强调，专注模式让周围安静下来。</div>
        </div>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-action="create"]')?.addEventListener('click', () => ctx.openNovelModal('create'));
  root.querySelectorAll('[data-open-novel]').forEach((button) => {
    button.addEventListener('click', () => ctx.openNovel(button.dataset.openNovel));
  });
}
