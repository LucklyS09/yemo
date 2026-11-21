/* 墨夜 · local-first save queue */

import { state, api, toast } from './core.js';

const pending = new Set();
const listeners = new Set();
let timer = null;
let flushing = null;

export function onSaveChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitSave() {
  listeners.forEach((fn) => {
    try {
      fn(state.save);
    } catch (error) {
      console.error(error);
    }
  });
}

function setSave(status, error = null) {
  state.save = {
    status,
    error,
    at: status === 'saved' ? Date.now() : state.save.at,
  };
  emitSave();
}

export function hasPending() {
  return pending.size > 0;
}

export function queueSave(section, wait = 650) {
  if (!state.novel) return;
  pending.add(section);
  if (state.save.status !== 'saving') setSave('pending');
  clearTimeout(timer);
  timer = setTimeout(() => {
    flushSaves();
  }, wait);
}

export function markAllSaved() {
  pending.clear();
  clearTimeout(timer);
  timer = null;
  setSave('saved');
}

function syncLibraryMeta(meta) {
  const list = state.library.novels;
  const index = list.findIndex((item) => item.id === meta.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...meta };
  } else {
    list.push(meta);
  }
  document.dispatchEvent(new CustomEvent('ink:library'));
}

export function applyStats(novel, stats) {
  if (!stats) return;
  if (stats.meta) {
    Object.assign(novel.meta, stats.meta);
  } else {
    if (typeof stats.wordCount === 'number') novel.meta.wordCount = stats.wordCount;
    if (typeof stats.draftCount === 'number') novel.meta.draftCount = stats.draftCount;
  }
  syncLibraryMeta(novel.meta);
  document.dispatchEvent(
    new CustomEvent('ink:stats', {
      detail: {
        novelId: novel.meta.id,
        wordCount: novel.meta.wordCount,
        draftCount: novel.meta.draftCount,
      },
    }),
  );
}

/**
 * Flush every dirty section. Safe to call repeatedly; calls while a flush is
 * already running wait for it and then drain anything queued in the meantime.
 */
export async function flushSaves() {
  clearTimeout(timer);
  timer = null;

  if (flushing) {
    await flushing;
    if (!pending.size) return true;
  }
  if (!pending.size || !state.novel) return true;

  const novel = state.novel;
  const keys = Array.from(pending);
  pending.clear();
  setSave('saving');

  flushing = (async () => {
    let failed = false;
    for (const key of keys) {
      try {
        if (!state.novel || state.novel.meta.id !== novel.meta.id) {
          // The active novel changed while saving. Drop stale work rather than
          // writing it into the wrong place.
          continue;
        }
        if (key === 'meta') {
          const result = await api.updateMeta(novel.meta.id, novel.meta);
          if (result?.meta) {
            Object.assign(novel.meta, result.meta);
            syncLibraryMeta(novel.meta);
          }
        } else if (key === 'outline') {
          await api.saveOutline(novel.meta.id, novel.outline);
        } else if (key === 'settings') {
          await api.saveSettings(novel.meta.id, novel.settings);
        } else if (key.startsWith('draft:')) {
          const draftId = key.slice(6);
          const draft = novel.drafts.find((item) => item.id === draftId);
          if (!draft) continue;
          const result = await api.updateDraft(novel.meta.id, draftId, {
            title: draft.title,
            content: draft.content,
            plain: draft.plain,
          });
          if (result?.draft) Object.assign(draft, result.draft);
          applyStats(novel, result?.stats);
        }
      } catch (error) {
        console.error('[墨夜] 保存失败', error);
        pending.add(key);
        failed = true;
      }
    }
    if (failed) {
      setSave('error', '保存失败，稍后会自动重试');
      toast('保存失败：请检查本地服务是否还在运行', 'error');
    } else {
      setSave('saved');
      document.dispatchEvent(new CustomEvent('ink:saved'));
    }
  })();

  await flushing;
  flushing = null;

  if (pending.size && !failedStatus()) {
    return flushSaves();
  }
  return !pending.size;
}

function failedStatus() {
  return state.save.status === 'error';
}

export function saveNow(section) {
  if (section) pending.add(section);
  return flushSaves();
}

/** True while a write is queued or in flight. */
export function hasPendingSaves() {
  return pending.size > 0 || Boolean(flushing);
}

/** Replace the full novel after a create/open action. */
export function setActiveNovel(novel) {
  state.novel = novel;
  state.library.novels = state.library.novels.map((item) =>
    item.id === novel.meta.id ? { ...item, ...novel.meta } : item,
  );
}
