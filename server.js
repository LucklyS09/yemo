'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.INK_DATA_DIR
  ? path.resolve(process.env.INK_DATA_DIR)
  : path.join(ROOT, 'data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const TRASH_DIR = path.join(DATA_DIR, '.trash');
const HISTORY_DIR = path.join(DATA_DIR, '.history');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const SNAPSHOT_LIMIT = 30;
const PORT = Number(process.env.PORT || 4173);

const CATEGORY_COLORS = [
  '#a78bfa', '#f472b6', '#67e8f9', '#f5c97b',
  '#86efac', '#fb923c', '#c4b5fd', '#f9a8d4',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const STAGE_NAMES = {
  act1: '第一幕', act2: '第二幕', act3: '第三幕',
  qi: '起', cheng: '承', zhuan: '转', he: '合',
  prologue: '序章', rise: '开端', develop: '发展', peak: '高潮', ending: '结局',
  spark: '灵感', build: '推进', clash: '冲突', echo: '余韵',
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function safeId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCategory(name) {
  const value = String(name || '').trim().slice(0, 24);
  return value || '未分类';
}

function countWords(text) {
  const value = String(text || '');
  const cjk = (value.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (value.replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}

function stripHtml(html) {
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

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, file);
}

async function ensureBase() {
  await fsp.mkdir(NOVELS_DIR, { recursive: true });
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  await fsp.mkdir(HISTORY_DIR, { recursive: true });
  try {
    await fsp.access(LIBRARY_FILE);
  } catch {
    await writeJson(LIBRARY_FILE, {
      version: 1,
      categories: [
        { name: '玄幻', color: '#a78bfa' },
        { name: '都市', color: '#67e8f9' },
        { name: '悬疑', color: '#f472b6' },
        { name: '示例', color: '#f5c97b' },
      ],
    });
  }
}

function novelDir(id) {
  return path.join(NOVELS_DIR, id);
}

async function ensureCategory(name) {
  const category = normalizeCategory(name);
  const lib = await readJson(LIBRARY_FILE, { version: 1, categories: [] });
  if (!Array.isArray(lib.categories)) lib.categories = [];
  if (!lib.categories.some((item) => item.name === category)) {
    lib.categories.push({
      name: category,
      color: CATEGORY_COLORS[lib.categories.length % CATEGORY_COLORS.length],
    });
    await writeJson(LIBRARY_FILE, lib);
  }
  return category;
}

// ---------------------------------------------------------------------------
// Novel storage
// ---------------------------------------------------------------------------

function normalizeMeta(meta) {
  return {
    id: meta.id,
    title: String(meta.title || '未命名小说').slice(0, 60),
    category: normalizeCategory(meta.category),
    summary: String(meta.summary || '').slice(0, 800),
    cover: String(meta.cover || 'jade').slice(0, 30),
    goal: Math.max(0, Math.min(99999999, Number(meta.goal) || 100000)),
    autoHighlight: meta.autoHighlight !== false,
    wordCount: Number(meta.wordCount) || 0,
    draftCount: Number(meta.draftCount) || 0,
    createdAt: meta.createdAt || nowIso(),
    updatedAt: meta.updatedAt || nowIso(),
    lastActiveAt: meta.lastActiveAt || meta.updatedAt || nowIso(),
  };
}

function normalizeDraft(draft) {
  const content = typeof draft.content === 'string' ? draft.content : '<p></p>';
  const plain = typeof draft.plain === 'string' ? draft.plain : stripHtml(content);
  return {
    id: draft.id,
    title: String(draft.title || '未命名章节').slice(0, 80),
    content,
    plain,
    wordCount: countWords(plain),
    order: Number(draft.order) || 1,
    createdAt: draft.createdAt || nowIso(),
    updatedAt: draft.updatedAt || nowIso(),
  };
}

async function listDrafts(id) {
  const dir = path.join(novelDir(id), 'drafts');
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const drafts = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const draft = await readJson(path.join(dir, name), null);
    if (draft && safeId(draft.id)) drafts.push(normalizeDraft(draft));
  }
  return drafts.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

async function readNovel(id) {
  const meta = await readJson(path.join(novelDir(id), 'meta.json'), null);
  if (!meta) return null;
  const outline = await readJson(path.join(novelDir(id), 'outline.json'), {
    style: 'three',
    beats: [],
  });
  const settings = await readJson(path.join(novelDir(id), 'settings.json'), { entries: [] });
  const drafts = await listDrafts(id);
  return {
    meta: normalizeMeta(meta),
    outline: {
      style: outline.style || 'three',
      beats: Array.isArray(outline.beats) ? outline.beats : [],
    },
    settings: {
      entries: Array.isArray(settings.entries) ? settings.entries : [],
    },
    drafts,
  };
}

async function refreshStats(id, touch = true) {
  const drafts = await listDrafts(id);
  const metaPath = path.join(novelDir(id), 'meta.json');
  const meta = normalizeMeta(await readJson(metaPath, {}));
  meta.wordCount = drafts.reduce((sum, draft) => sum + countWords(draft.plain), 0);
  meta.draftCount = drafts.length;
  if (touch) {
    meta.updatedAt = nowIso();
    meta.lastActiveAt = meta.updatedAt;
  }
  await writeJson(metaPath, meta);
  return { wordCount: meta.wordCount, draftCount: meta.draftCount, meta };
}

async function touchNovel(id) {
  const metaPath = path.join(novelDir(id), 'meta.json');
  const meta = await readJson(metaPath, null);
  if (!meta) return;
  meta.updatedAt = nowIso();
  meta.lastActiveAt = meta.updatedAt;
  await writeJson(metaPath, normalizeMeta(meta));
}

async function listLibrary() {
  const lib = await readJson(LIBRARY_FILE, { version: 1, categories: [] });
  let dirs = [];
  try {
    dirs = await fsp.readdir(NOVELS_DIR, { withFileTypes: true });
  } catch {
    dirs = [];
  }
  const novels = [];
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const meta = await readJson(path.join(NOVELS_DIR, entry.name, 'meta.json'), null);
    if (meta && safeId(meta.id)) novels.push(normalizeMeta(meta));
  }
  novels.sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)));

  const categories = [];
  const seen = new Set();
  for (const item of Array.isArray(lib.categories) ? lib.categories : []) {
    if (!item || !item.name || seen.has(item.name)) continue;
    seen.add(item.name);
    categories.push({ name: item.name, color: item.color || '#a78bfa' });
  }
  for (const meta of novels) {
    if (!seen.has(meta.category)) {
      seen.add(meta.category);
      categories.push({
        name: meta.category,
        color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
      });
    }
  }
  return { categories, novels };
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

function historyDir(id) {
  return path.join(HISTORY_DIR, id);
}

function snapshotSummary(id, data) {
  const novel = data.novel || {};
  const meta = novel.meta || {};
  return {
    id,
    createdAt: data.createdAt || nowIso(),
    reason: data.reason || '自动快照',
    title: meta.title || '未命名小说',
    category: meta.category || '未分类',
    wordCount: Number(meta.wordCount) || 0,
    draftCount: Array.isArray(novel.drafts) ? novel.drafts.length : 0,
    settingsCount: Array.isArray(novel.settings?.entries) ? novel.settings.entries.length : 0,
    beatCount: Array.isArray(novel.outline?.beats) ? novel.outline.beats.length : 0,
  };
}

async function snapshotFileNames(id) {
  try {
    const names = await fsp.readdir(historyDir(id));
    return names.filter((name) => name.endsWith('.json') && safeId(name.slice(0, -5))).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readSnapshot(id, snapshotId) {
  if (!safeId(snapshotId)) return null;
  return readJson(path.join(historyDir(id), `${snapshotId}.json`), null);
}

async function listSnapshots(id) {
  const names = await snapshotFileNames(id);
  const snapshots = [];
  for (const name of names) {
    const snapshotId = name.slice(0, -5);
    const data = await readSnapshot(id, snapshotId);
    if (data) snapshots.push(snapshotSummary(snapshotId, data));
  }
  return snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function createSnapshot(id, reason = '自动快照') {
  const novel = await readNovel(id);
  if (!novel) return null;
  const snapshotId = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const data = {
    version: 1,
    id: snapshotId,
    createdAt: nowIso(),
    reason,
    novel,
  };
  await writeJson(path.join(historyDir(id), `${snapshotId}.json`), data);

  const names = await snapshotFileNames(id);
  while (names.length > SNAPSHOT_LIMIT) {
    const oldest = names.shift();
    await fsp.unlink(path.join(historyDir(id), oldest)).catch(() => {});
  }
  return snapshotSummary(snapshotId, data);
}

async function maybeSnapshot(id, reason = '自动快照') {
  const names = await snapshotFileNames(id);
  if (names.length) {
    let newest = 0;
    for (const name of names) {
      try {
        const stat = await fsp.stat(path.join(historyDir(id), name));
        newest = Math.max(newest, stat.mtimeMs);
      } catch {
        // Ignore a concurrently removed snapshot.
      }
    }
    if (newest && Date.now() - newest < SNAPSHOT_INTERVAL_MS) return null;
  }
  return createSnapshot(id, reason);
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

async function listTrash() {
  let entries = [];
  try {
    entries = await fsp.readdir(TRASH_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readJson(path.join(TRASH_DIR, entry.name, 'meta.json'), null);
    if (!meta) continue;
    let deletedAt = nowIso();
    try {
      const stat = await fsp.stat(path.join(TRASH_DIR, entry.name));
      deletedAt = stat.birthtime?.toISOString?.() || stat.mtime.toISOString();
    } catch {
      // Keep the fallback timestamp.
    }
    items.push({
      trashId: entry.name,
      title: meta.title || '未命名小说',
      category: meta.category || '未分类',
      wordCount: Number(meta.wordCount) || 0,
      draftCount: Number(meta.draftCount) || 0,
      deletedAt,
      id: meta.id,
    });
  }
  return items.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

function trashPath(trashId) {
  if (!safeId(trashId)) return null;
  return path.join(TRASH_DIR, trashId);
}


// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('内容过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('JSON 格式不正确'), { statusCode: 400 });
  }
}

function attachmentName(name, ext) {
  const base = String(name || 'novel')
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .trim()
    .slice(0, 60) || 'novel';
  return { ascii: `novel.${ext}`, utf8: encodeURIComponent(`${base}.${ext}`) };
}

function sendDownload(res, body, filename, mime) {
  const name = attachmentName(filename.replace(/\.[^.]+$/, ''), filename.split('.').pop());
  res.writeHead(200, {
    'Content-Type': `${mime}; charset=utf-8`,
    'Content-Disposition': `attachment; filename="${name.ascii}"; filename*=UTF-8''${name.utf8}`,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function htmlToText(html) {
  return stripHtml(html);
}

function markdownForNovel(novel) {
  const lines = [];
  lines.push(`# ${novel.meta.title}`, '');
  if (novel.meta.summary) lines.push(`> ${novel.meta.summary.replace(/\n/g, '\n> ')}`, '');
  lines.push(`- 分类：${novel.meta.category}`);
  lines.push(`- 字数：${novel.meta.wordCount}`);
  lines.push(`- 章节：${novel.meta.draftCount}`, '');

  lines.push('## 故事大纲', '');
  if (!novel.outline.beats.length) lines.push('_还没有大纲节拍。_', '');
  for (const beat of novel.outline.beats) {
    const stage = STAGE_NAMES[beat.stage] || beat.stage || '';
    lines.push(`### ${beat.title || '未命名节拍'}${stage ? ` · ${stage}` : ''}`, '');
    if (beat.summary) lines.push(beat.summary, '');
  }

  lines.push('## 设定集', '');
  for (const entry of novel.settings.entries) {
    lines.push(`### ${entry.title || '未命名词条'}（${entry.kind || '设定'}）`, '');
    if (entry.aliases && entry.aliases.length) lines.push(`别名：${entry.aliases.join('、')}`, '');
    if (entry.body) lines.push(entry.body, '');
  }

  lines.push('## 正文', '');
  for (const draft of novel.drafts) {
    lines.push(`### ${draft.title}`, '', htmlToText(draft.content), '');
  }
  return `${lines.join('\n').trim()}\n`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function handleApi(req, res, pathname, url) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, name: 'ink-nocturne', time: nowIso() });
  }

  if (pathname === '/api/library' && req.method === 'GET') {
    return sendJson(res, 200, await listLibrary());
  }

  if (pathname === '/api/novels' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const title = String(body.title || '').trim().slice(0, 60) || '未命名小说';
    const category = await ensureCategory(body.category);
    const id = makeId('n');
    const stamp = nowIso();
    const meta = normalizeMeta({
      id,
      title,
      category,
      summary: body.summary || '',
      cover: body.cover || 'jade',
      goal: body.goal || 100000,
      autoHighlight: true,
      createdAt: stamp,
      updatedAt: stamp,
      lastActiveAt: stamp,
    });
    await fsp.mkdir(path.join(novelDir(id), 'drafts'), { recursive: true });
    await writeJson(path.join(novelDir(id), 'meta.json'), meta);
    await writeJson(path.join(novelDir(id), 'outline.json'), {
      style: 'three',
      beats: [],
    });
    await writeJson(path.join(novelDir(id), 'settings.json'), { entries: [] });
    const firstDraft = normalizeDraft({
      id: makeId('d'),
      title: '第一章 未命名',
      content: '<p><br></p>',
      plain: '',
      order: 1,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await writeJson(path.join(novelDir(id), 'drafts', `${firstDraft.id}.json`), firstDraft);
    await refreshStats(id);
    const novel = await readNovel(id);
    return sendJson(res, 201, novel);
  }

  const trashMatch = pathname.match(/^\/api\/trash(?:\/([a-zA-Z0-9_-]+))?$/);
  if (trashMatch) {
    const trashId = trashMatch[1] || '';
    if (!trashId && req.method === 'GET') {
      return sendJson(res, 200, { items: await listTrash() });
    }
    const target = trashPath(trashId);
    if (!target) return sendError(res, 400, '回收站编号无效');
    const meta = await readJson(path.join(target, 'meta.json'), null);
    if (!meta) return sendError(res, 404, '回收站里没有这部小说');

    if (req.method === 'POST') {
      if (!safeId(meta.id)) return sendError(res, 400, '这部小说的编号无效');
      const destination = novelDir(meta.id);
      try {
        await fsp.access(destination);
        return sendError(res, 409, '同名小说已经存在，先把它移走再恢复');
      } catch {
        // Good: the destination is free.
      }
      await fsp.mkdir(NOVELS_DIR, { recursive: true });
      await fsp.rename(target, destination);
      return sendJson(res, 200, { ok: true, meta: normalizeMeta(meta) });
    }

    if (req.method === 'DELETE') {
      await fsp.rm(target, { recursive: true, force: true });
      if (safeId(meta.id)) {
        await fsp.rm(historyDir(meta.id), { recursive: true, force: true });
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendError(res, 405, '不支持这个操作');
  }

  const novelMatch = pathname.match(/^\/api\/novels\/([a-zA-Z0-9_-]+)(?:\/([a-z]+)(?:\/([a-zA-Z0-9_-]+))?)?$/);
  if (!novelMatch) return sendError(res, 404, '接口不存在');

  const id = safeId(novelMatch[1]);
  if (!id) return sendError(res, 400, '小说编号无效');
  const section = novelMatch[2] || '';
  const subId = novelMatch[3] || '';

  const existing = await readJson(path.join(novelDir(id), 'meta.json'), null);
  if (!existing) return sendError(res, 404, '找不到这部小说');

  if (section === 'history' && !subId) {
    if (req.method === 'GET') {
      return sendJson(res, 200, { snapshots: await listSnapshots(id) });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const snapshot = await createSnapshot(id, String(body.reason || '手动快照').slice(0, 40));
      return sendJson(res, 201, { snapshot });
    }
    return sendError(res, 405, '不支持这个操作');
  }

  if (section === 'history' && subId) {
    const snapshot = await readSnapshot(id, subId);
    if (!snapshot) return sendError(res, 404, '找不到这个版本');

    if (req.method === 'GET') {
      return sendJson(res, 200, snapshot);
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const scope = String(body.scope || '');
      await createSnapshot(id, '恢复版本前');

      if (scope === 'settings') {
        const entries = Array.isArray(snapshot.novel?.settings?.entries)
          ? snapshot.novel.settings.entries
          : [];
        await writeJson(path.join(novelDir(id), 'settings.json'), { entries });
        await touchNovel(id);
        return sendJson(res, 200, { ok: true, scope });
      }

      if (scope === 'outline') {
        const outline = snapshot.novel?.outline || { style: 'three', beats: [] };
        await writeJson(path.join(novelDir(id), 'outline.json'), {
          style: String(outline.style || 'three').slice(0, 20),
          beats: Array.isArray(outline.beats) ? outline.beats.slice(0, 500) : [],
        });
        await touchNovel(id);
        return sendJson(res, 200, { ok: true, scope });
      }

      if (scope === 'draft') {
        const draftId = safeId(body.draftId);
        if (!draftId) return sendError(res, 400, '章节编号无效');
        const draft = (snapshot.novel?.drafts || []).find((item) => item.id === draftId);
        if (!draft) return sendError(res, 404, '这个版本里没有这一章');
        const restored = normalizeDraft(draft);
        await writeJson(path.join(novelDir(id), 'drafts', `${restored.id}.json`), restored);
        const stats = await refreshStats(id);
        return sendJson(res, 200, { ok: true, scope, draft: restored, stats });
      }

      return sendError(res, 400, '不支持的恢复范围');
    }

    return sendError(res, 405, '不支持这个操作');
  }

  if (!section && req.method === 'GET') {
    const novel = await readNovel(id);
    return sendJson(res, 200, novel);
  }

  if (!section && req.method === 'DELETE') {
    await fsp.mkdir(TRASH_DIR, { recursive: true });
    const target = path.join(TRASH_DIR, `${id}-${Date.now()}`);
    await fsp.rename(novelDir(id), target);
    return sendJson(res, 200, { ok: true, trashedTo: target });
  }

  if (section === 'meta' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    await maybeSnapshot(id, '修改小说资料前');
    const meta = normalizeMeta({
      ...existing,
      ...body,
      id,
      wordCount: existing.wordCount || 0,
      draftCount: existing.draftCount || 0,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
      lastActiveAt: nowIso(),
    });
    if (body.category !== undefined) meta.category = await ensureCategory(body.category);
    await writeJson(path.join(novelDir(id), 'meta.json'), meta);
    return sendJson(res, 200, { meta });
  }

  if (section === 'outline' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    await maybeSnapshot(id, '修改大纲前');
    const outline = {
      style: String(body.style || 'three').slice(0, 20),
      beats: Array.isArray(body.beats) ? body.beats.slice(0, 500) : [],
    };
    await writeJson(path.join(novelDir(id), 'outline.json'), outline);
    await touchNovel(id);
    return sendJson(res, 200, { outline });
  }

  if (section === 'settings' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    await maybeSnapshot(id, '修改设定前');
    const entries = Array.isArray(body.entries) ? body.entries.slice(0, 2000) : [];
    await writeJson(path.join(novelDir(id), 'settings.json'), { entries });
    await touchNovel(id);
    return sendJson(res, 200, { entries });
  }

  if (section === 'drafts' && !subId && req.method === 'POST') {
    const body = await readJsonBody(req);
    await maybeSnapshot(id, '新建章节前');
    const drafts = await listDrafts(id);
    const order = drafts.length ? Math.max(...drafts.map((item) => item.order)) + 1 : 1;
    const stamp = nowIso();
    const draft = normalizeDraft({
      id: makeId('d'),
      title: body.title || `第${order}章 未命名`,
      content: body.content || '<p><br></p>',
      plain: body.plain || '',
      order,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await writeJson(path.join(novelDir(id), 'drafts', `${draft.id}.json`), draft);
    const stats = await refreshStats(id);
    return sendJson(res, 201, { draft, stats });
  }

  if (section === 'drafts' && subId) {
    const draftId = safeId(subId);
    if (!draftId) return sendError(res, 400, '章节编号无效');
    const file = path.join(novelDir(id), 'drafts', `${draftId}.json`);
    const existingDraft = await readJson(file, null);
    if (!existingDraft) return sendError(res, 404, '找不到这一章');

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      await maybeSnapshot(id, '修改正文前');
      const draft = normalizeDraft({
        ...existingDraft,
        title: body.title !== undefined ? body.title : existingDraft.title,
        content: body.content !== undefined ? body.content : existingDraft.content,
        plain: body.plain !== undefined ? body.plain : existingDraft.plain,
        updatedAt: nowIso(),
      });
      await writeJson(file, draft);
      const stats = await refreshStats(id);
      return sendJson(res, 200, { draft, stats });
    }

    if (req.method === 'DELETE') {
      await createSnapshot(id, '删除章节前');
      await fsp.unlink(file);
      const stats = await refreshStats(id);
      return sendJson(res, 200, { ok: true, stats });
    }
  }

  if (section === 'reveal' && req.method === 'POST') {
    const dir = novelDir(id);
    try {
      if (process.platform === 'win32') {
        spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {
      return sendError(res, 500, '无法打开文件夹');
    }
    return sendJson(res, 200, { ok: true, path: dir });
  }

  if (section === 'export' && req.method === 'GET') {
    const novel = await readNovel(id);
    const format = url.searchParams.get('format') || 'json';
    if (format === 'md') {
      return sendDownload(res, markdownForNovel(novel), `${novel.meta.title}.md`, 'text/markdown');
    }
    return sendDownload(
      res,
      JSON.stringify(novel, null, 2),
      `${novel.meta.title}.json`,
      'application/json',
    );
  }

  return sendError(res, 405, '不支持这个操作');
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, '不支持的请求');
  let relative = pathname === '/' ? '/index.html' : pathname;
  try {
    relative = decodeURIComponent(relative);
  } catch {
    return sendError(res, 400, '路径无效');
  }
  const file = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendError(res, 403, '拒绝访问');
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return sendError(res, 404, '页面不存在');
  }
  if (!stat.isFile()) return sendError(res, 404, '页面不存在');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url);
    } else {
      await serveStatic(req, res, pathname);
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    console.error('[墨夜]', error);
    sendError(res, error.statusCode || 500, error.message || '服务器开小差了');
  }
});

function openBrowser(url) {
  if (process.env.INK_OPEN !== '1') return;
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // The address is printed below anyway.
  }
}

function probeInk(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 700 },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(raw).name === 'ink-nocturne');
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function start(options = {}) {
  await ensureBase();
  const initialPort = Number.isInteger(options.port) ? options.port : PORT;
  const shouldOpen = options.openBrowser === true || process.env.INK_OPEN === '1';
  const quiet = options.quiet === true;

  return new Promise((resolve, reject) => {
    const tryListen = (port, attempt = 0) => {
      const onError = async (error) => {
        server.removeListener('listening', onListening);
        if (error.code === 'EADDRINUSE' && attempt < 20) {
          if (await probeInk(port)) {
            const url = `http://127.0.0.1:${port}`;
            if (!quiet) console.log(`\n  墨夜已经在运行：${url}`);
            if (shouldOpen) openBrowser(url);
            resolve({ existing: true, port, url, server: null });
            return;
          }
          tryListen(port + 1, attempt + 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        const actualPort = server.address().port;
        const url = `http://127.0.0.1:${actualPort}`;
        if (!quiet) {
          console.log('');
          console.log('  \x1b[38;5;183m墨夜 INK NOCTURNE\x1b[0m');
          console.log(`  写作空间已启动：\x1b[4m${url}\x1b[0m`);
          console.log(`  数据目录：${DATA_DIR}`);
          if (actualPort !== PORT) console.log(`  （端口 ${PORT} 被占用，已自动换到 ${actualPort}）`);
          console.log('  按 Ctrl+C 退出。');
          console.log('');
        }
        if (shouldOpen) setTimeout(() => openBrowser(url), 450);
        resolve({ existing: false, port: actualPort, url, server });
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };
    tryListen(initialPort);
  });
}

if (require.main === module) {
  process.on('SIGINT', () => {
    console.log('\n  墨夜已收起，故事还在。');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 800);
  });

  start({ openBrowser: process.env.INK_OPEN === '1' }).then((handle) => {
    if (handle.existing) setTimeout(() => process.exit(0), 200);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { start, server };
