// Find and replace across questions. HTML fields are searched in their text only, so tags and attributes
// (image data, links, styles) are never matched or changed.

import { decodeEntities, escapeHtml } from './model.js';

/** Builds the search pattern, or null when there is nothing to search for. */
export function buildPattern(find, { matchCase = false, wholeWord = false } = {}) {
  if (!find) return null;
  let src = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  return new RegExp(src, matchCase ? 'gu' : 'giu');
}

/** The searchable text fields of a question, as [object, key, isHtml, label]. */
export function textFields(q) {
  const f = [[q, 'name', false, 'Name']];
  f.push([q, 'questiontext', (q.questiontextformat || 'html') === 'html', 'Question text']);
  for (const key of ['correctfeedback', 'partiallycorrectfeedback', 'incorrectfeedback', 'feedbacktrue', 'feedbackfalse', 'generalfeedback', 'responsetemplate', 'graderinfo']) {
    if (typeof q[key] === 'string') f.push([q, key, true, key === 'generalfeedback' ? 'General feedback' : key === 'graderinfo' ? 'Information for graders' : key === 'responsetemplate' ? 'Response template' : 'Feedback']);
  }
  (q.answers || []).forEach((a) => {
    f.push([a, 'text', q.type === 'multichoice', 'Answer']);
    f.push([a, 'feedback', true, 'Answer feedback']);
  });
  (q.subquestions || []).forEach((s) => {
    f.push([s, 'text', true, 'Sub-question']);
    f.push([s, 'answer', false, 'Sub-question answer']);
  });
  (q.choices || []).forEach((c) => f.push([c, 'text', false, 'Choice']));
  (q.items || []).forEach((it) => f.push([it, 'text', true, 'Item']));
  (q.hints || []).forEach((h) => f.push([h, 'text', true, 'Hint']));
  return f.filter(([obj, key]) => typeof obj[key] === 'string' && obj[key] !== '');
}

// Splits HTML into tags (odd indexes) and text (even indexes).
const splitHtml = (html) => html.split(/(<!--[\s\S]*?-->|<[^>]*>)/);

function countIn(value, isHtml, re) {
  const parts = isHtml ? splitHtml(value).filter((_, i) => i % 2 === 0).map(decodeEntities) : [value];
  return parts.reduce((n, t) => n + (t.match(re)?.length ?? 0), 0);
}

function replaceIn(value, isHtml, re, replacement) {
  // A function replacement keeps "$" in the replacement text literal.
  const plain = (t) => t.replace(re, () => replacement);
  if (!isHtml) return plain(value);
  return splitHtml(value)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const text = decodeEntities(part);
      if (!text.match(re)) return part;
      return escapeHtml(plain(text)).replace(/ /g, '&nbsp;');
    })
    .join('');
}

/** Number of matches in a question, and the labels of the fields they are in. */
export function findInQuestion(q, re) {
  let count = 0;
  const where = [];
  for (const [obj, key, isHtml, label] of textFields(q)) {
    const n = countIn(obj[key], isHtml, re);
    if (n) {
      count += n;
      if (!where.includes(label)) where.push(label);
    }
  }
  return { count, where };
}

/** Replaces every match in a question in place and returns the number of replacements. */
export function replaceInQuestion(q, re, replacement) {
  let count = 0;
  for (const [obj, key, isHtml] of textFields(q)) {
    const n = countIn(obj[key], isHtml, re);
    if (!n) continue;
    obj[key] = replaceIn(obj[key], isHtml, re, replacement);
    count += n;
  }
  return count;
}

/** A short plain-text excerpt around the first match, split into [before, match, after]. */
export function snippet(q, re) {
  for (const [obj, key, isHtml] of textFields(q)) {
    const text = (isHtml ? splitHtml(obj[key]).filter((_, i) => i % 2 === 0).map(decodeEntities).join(' ') : obj[key]).replace(/\s+/g, ' ').trim();
    re.lastIndex = 0;
    const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
    if (!m) continue;
    const start = Math.max(0, m.index - 40);
    const end = Math.min(text.length, m.index + m[0].length + 40);
    return [(start ? '…' : '') + text.slice(start, m.index), m[0], text.slice(m.index + m[0].length, end) + (end < text.length ? '…' : '')];
  }
  return null;
}
