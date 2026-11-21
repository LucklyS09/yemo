/* 墨夜 · character / term colouring
 * Uses the CSS Custom Highlight API so highlighting never touches the DOM,
 * never breaks undo history and never moves the caret.
 */

import { hexToRgba, termEntries } from './core.js';

let activeNames = [];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mixHex(hex, target, ratio) {
  const parse = (value) => {
    const raw = String(value || '').replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
    const number = Number.parseInt(full, 16);
    if (Number.isNaN(number)) return [255, 255, 255];
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const mix = (a, b) => Math.round(a * (1 - ratio) + b * ratio).toString(16).padStart(2, '0');
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}

function termPaint(color, light) {
  return light ? mixHex(color, '#17221e', 0.46) : color;
}

function collectTerms(entries) {
  const seen = new Set();
  const terms = [];
  for (const entry of termEntries(entries)) {
    const candidates = [entry.title, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      terms.push({ text, color: entry.color || '#f5c97b', entryId: entry.id });
    }
  }
  return terms.sort((a, b) => b.text.length - a.text.length);
}

function clearHighlightStyles() {
  for (const name of activeNames) {
    try {
      CSS.highlights.delete(name);
    } catch {
      // ignore
    }
  }
  activeNames = [];
  document.getElementById('inkTermHighlightStyles')?.remove();
  document.getElementById('inkTermHighlightDomStyles')?.remove();
}

function nodeIsExcluded(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('script, style, code, pre, mark, .no-term')) return true;
  const styled = parent.closest('[style]');
  if (styled && styled.style && styled.style.color) return true;
  return false;
}

function markFallback(editor, terms) {
  const light = document.documentElement.dataset.scheme === 'light';
  const style = document.createElement('style');
  style.id = 'inkTermHighlightDomStyles';
  style.textContent = '.term-auto { border-radius: 3px; }';
  document.head.appendChild(style);

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return nodeIsExcluded(node) || !node.nodeValue.trim()
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const regex = new RegExp(terms.map((term) => escapeRegExp(term.text)).join('|'), 'g');

  for (const node of nodes) {
    const text = node.nodeValue;
    regex.lastIndex = 0;
    let match;
    let last = 0;
    let fragment = null;
    while ((match = regex.exec(text))) {
      const term = terms.find((item) => item.text === match[0]);
      if (!term) continue;
      fragment ||= document.createDocumentFragment();
      if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const span = document.createElement('span');
      span.className = 'term-auto';
      span.dataset.term = term.text;
      span.style.color = termPaint(term.color, light);
      span.textContent = match[0];
      fragment.appendChild(span);
      last = match.index + match[0].length;
    }
    if (fragment) {
      if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    }
  }
  return editor.querySelectorAll('.term-auto').length;
}

export function clearTermHighlights(editor) {
  clearHighlightStyles();
  if (!editor) return;
  const marks = editor.querySelectorAll('.term-auto');
  if (!marks.length) return;
  marks.forEach((span) => {
    span.replaceWith(document.createTextNode(span.textContent || ''));
  });
  editor.normalize();
}

/**
 * Paint every registered name/alias inside the editor. Returns the number of
 * painted occurrences. Safe to call on every input event.
 */
export function applyTermHighlights(editor, entries, enabled = true) {
  if (!editor) return 0;
  const terms = collectTerms(entries);
  if (!enabled || !terms.length) {
    clearTermHighlights(editor);
    return 0;
  }

  if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') {
    clearHighlightStyles();
    clearTermHighlights(editor);
    return markFallback(editor, terms);
  }

  clearTermHighlights(editor);

  const light = document.documentElement.dataset.scheme === 'light';
  const regex = new RegExp(terms.map((term) => escapeRegExp(term.text)).join('|'), 'g');
  const byColor = new Map();
  let total = 0;

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return nodeIsExcluded(node) || !node.nodeValue
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      const term = terms.find((item) => item.text === match[0]);
      if (!term) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const paint = termPaint(term.color, light);
      if (!byColor.has(paint)) byColor.set(paint, []);
      byColor.get(paint).push(range);
      total += 1;
    }
  }

  if (!total) return 0;

  const css = [];
  let index = 0;
  for (const [color, ranges] of byColor) {
    const name = `inkterm-${index++}`;
    CSS.highlights.set(name, new Highlight(...ranges));
    activeNames.push(name);
    css.push(
      `::highlight(${name}) { color: ${color}; background-color: ${hexToRgba(color, 0.075)}; }`,
    );
  }
  const style = document.createElement('style');
  style.id = 'inkTermHighlightStyles';
  style.textContent = css.join('\n');
  document.head.appendChild(style);
  editor.dataset.highlightCount = String(total);
  return total;
}

export function countTermOccurrences(entry, drafts) {
  const terms = [entry.title, ...(entry.aliases || [])]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length || !drafts?.length) return 0;
  const regex = new RegExp(terms.map(escapeRegExp).join('|'), 'g');
  let count = 0;
  for (const draft of drafts) {
    const text = draft.plain || '';
    const matches = text.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

export function totalTermOccurrences(entries, drafts) {
  return (entries || []).reduce((sum, entry) => sum + countTermOccurrences(entry, drafts), 0);
}
