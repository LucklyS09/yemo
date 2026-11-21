/* 墨夜 · 版本历史 / 回收站 */

import {
  api,
  state,
  esc,
  icon,
  openModal,
  confirmDialog,
  toast,
  formatNumber,
} from './core.js';

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clip(text, length = 2200) {
  const value = String(text || '');
  return value.length > length ? `${value.slice(0, length)}\n\n…（预览已截断，恢复后仍是完整内容）` : value;
}

function currentDraftText(id) {
  const draft = state.novel?.drafts.find((item) => item.id === id);
  return clip(draft?.plain || '');
}

function snapshotDraftText(snapshot, id) {
  const draft = snapshot?.novel?.drafts?.find((item) => item.id === id);
  return clip(draft?.plain || '');
}

export async function openHistory(novel, onRestored) {
  if (!novel) return;
  let snapshots = [];
  let current = null;

  const modal = openModal({
    title: '版本历史',
    eyebrow: 'SAFE COPY',
    size: 'lg',
    body: `<div class="history-layout">
      <aside class="history-list">
        <div class="history-list__head">
          <span>自动快照</span>
          <button class="ghost-btn btn-sm" type="button" data-history-create>${icon('plus', 12)} 立即快照</button>
        </div>
        <div class="history-list__items scroll-area" id="historyItems"><div class="history-note">正在读取…</div></div>
      </aside>
      <section class="history-preview" id="historyPreview">
        <div class="history-note">选择一个版本，预览或恢复。</div>
      </section>
    </div>`,
    onMount(panel, close) {
      const items = panel.querySelector('#historyItems');
      const preview = panel.querySelector('#historyPreview');

      const restore = async (scope, payload = {}) => {
        if (!current) return;
        try {
          await api.restoreHistory(novel.meta.id, current.id, { scope, ...payload });
          toast(scope === 'settings' ? '设定集已恢复' : '章节已恢复');
          close();
          await onRestored?.();
        } catch (error) {
          toast(error.message || '恢复失败', 'error');
        }
      };

      const renderPreview = (snapshot) => {
        const drafts = Array.isArray(snapshot?.novel?.drafts) ? snapshot.novel.drafts : [];
        const preferred = drafts.find((item) => item.id === state.draftId) || drafts[0];
        const meta = snapshot?.novel?.meta || {};
        preview.innerHTML = `<div class="history-preview__head">
          <div>
            <div class="eyebrow">SNAPSHOT</div>
            <h3>${esc(dateLabel(snapshot.createdAt))}</h3>
            <p>${esc(snapshot.reason || '自动快照')} · ${formatNumber(meta.wordCount || 0)} 字 · ${drafts.length} 章 · 恢复前会自动快照</p>
          </div>
          <button class="primary-btn btn-sm" type="button" data-restore-settings>恢复设定集</button>
        </div>
        <div class="history-draft-row">
          <label for="historyDraft">预览 / 恢复章节</label>
          <select class="select-input" id="historyDraft">
            ${drafts
              .map(
                (draft) =>
                  `<option value="${esc(draft.id)}" ${preferred?.id === draft.id ? 'selected' : ''}>${esc(draft.title || '未命名章节')} · ${formatNumber(draft.wordCount || 0)} 字</option>`,
              )
              .join('')}
          </select>
          <button class="ghost-btn btn-sm" type="button" data-restore-draft>恢复这一章</button>
        </div>
        <div class="history-compare">
          <div class="history-compare__col">
            <div class="history-compare__label">快照正文</div>
            <pre id="historySnapText">${esc(snapshotDraftText(snapshot, preferred?.id))}</pre>
          </div>
          <div class="history-compare__col">
            <div class="history-compare__label">当前正文</div>
            <pre id="historyCurrentText">${esc(currentDraftText(preferred?.id))}</pre>
          </div>
        </div>`;

        const select = preview.querySelector('#historyDraft');
        const updateText = () => {
          const id = select?.value;
          const snapText = preview.querySelector('#historySnapText');
          const currentText = preview.querySelector('#historyCurrentText');
          if (snapText) snapText.textContent = snapshotDraftText(snapshot, id);
          if (currentText) currentText.textContent = currentDraftText(id);
        };
        select?.addEventListener('change', updateText);
        preview
          .querySelector('[data-restore-settings]')
          ?.addEventListener('click', () => restore('settings'));
        preview
          .querySelector('[data-restore-draft]')
          ?.addEventListener('click', () => restore('draft', { draftId: select?.value }));
      };

      const selectSnapshot = async (snapshotId) => {
        items.querySelectorAll('.history-item').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.snapshotId === snapshotId);
        });
        preview.innerHTML = '<div class="history-note">正在打开快照…</div>';
        try {
          current = await api.historySnapshot(novel.meta.id, snapshotId);
          renderPreview(current);
        } catch (error) {
          preview.innerHTML = `<div class="history-note history-note--error">${esc(error.message || '读取快照失败')}</div>`;
        }
      };

      const load = async (selectFirst = false) => {
        try {
          const data = await api.history(novel.meta.id);
          snapshots = data.snapshots || [];
          if (!snapshots.length) {
            items.innerHTML = '<div class="history-note">还没有版本。<br>继续写作，每 5 分钟会自动留一个。</div>';
            preview.innerHTML = '<div class="history-note">也可以点上面的「立即快照」留一个当前版本。</div>';
            return;
          }
          items.innerHTML = snapshots
            .map(
              (snapshot) =>
                `<button class="history-item" type="button" data-snapshot-id="${esc(snapshot.id)}">
                  <span class="history-item__time">${esc(dateLabel(snapshot.createdAt))}</span>
                  <span class="history-item__reason">${esc(snapshot.reason || '自动快照')}</span>
                  <span class="history-item__meta">${formatNumber(snapshot.wordCount || 0)} 字 · ${snapshot.draftCount || 0} 章</span>
                </button>`,
            )
            .join('');
          items.querySelectorAll('[data-snapshot-id]').forEach((button) => {
            button.addEventListener('click', () => selectSnapshot(button.dataset.snapshotId));
          });
          if (selectFirst) await selectSnapshot(snapshots[0].id);
        } catch (error) {
          items.innerHTML = `<div class="history-note history-note--error">${esc(error.message || '读取版本历史失败')}</div>`;
        }
      };

      panel.querySelector('[data-history-create]')?.addEventListener('click', async () => {
        try {
          await api.createHistory(novel.meta.id, '手动快照');
          toast('已保存一个版本');
          await load(true);
        } catch (error) {
          toast(error.message || '创建快照失败', 'error');
        }
      });

      load(true);
    },
  });
  return modal;
}

export async function openTrash(onRestored) {
  const modal = openModal({
    title: '最近删除',
    eyebrow: 'TRASH',
    size: 'md',
    body: '<div id="trashItems"><div class="history-note">正在读取…</div></div>',
    onMount(panel, close) {
      const container = panel.querySelector('#trashItems');

      const load = async () => {
        try {
          const data = await api.trash();
          const items = data.items || [];
          if (!items.length) {
            container.innerHTML = '<div class="trash-empty">回收站是空的。<br>删除的小说会先来到这里，不会立刻消失。</div>';
            return;
          }
          container.innerHTML = items
            .map(
              (item) =>
                `<div class="trash-item">
                  <div class="trash-item__copy">
                    <strong>${esc(item.title)}</strong>
                    <span>${esc(item.category)} · ${formatNumber(item.wordCount || 0)} 字 · ${item.draftCount || 0} 章 · 删除于 ${esc(dateLabel(item.deletedAt))}</span>
                  </div>
                  <div class="trash-item__actions">
                    <button class="ghost-btn btn-sm" type="button" data-restore="${esc(item.trashId)}">${icon('undo', 12)} 恢复</button>
                    <button class="icon-btn icon-btn--danger" type="button" data-purge="${esc(item.trashId)}" title="彻底删除">${icon('trash', 14)}</button>
                  </div>
                </div>`,
            )
            .join('');

          container.querySelectorAll('[data-restore]').forEach((button) => {
            button.addEventListener('click', async () => {
              try {
                await api.restoreTrash(button.dataset.restore);
                toast('小说已恢复');
                await load();
                await onRestored?.();
              } catch (error) {
                toast(error.message || '恢复失败', 'error');
              }
            });
          });

          container.querySelectorAll('[data-purge]').forEach((button) => {
            button.addEventListener('click', async () => {
              const confirmed = await confirmDialog({
                title: '彻底删除这部小说？',
                message: '这一份回收站副本会从硬盘上移除，无法撤销。',
                confirmText: '彻底删除',
                danger: true,
              });
              if (!confirmed) {
                openTrash(onRestored);
                return;
              }
              try {
                await api.purgeTrash(button.dataset.purge);
                toast('已彻底删除');
                await load();
              } catch (error) {
                toast(error.message || '删除失败', 'error');
              }
            });
          });
        } catch (error) {
          container.innerHTML = `<div class="history-note history-note--error">${esc(error.message || '读取回收站失败')}</div>`;
        }
      };

      load();
    },
  });
  return modal;
}
