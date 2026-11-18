// Changing the case of selected text (in the rich-text editor and the live preview), and the text offsets used to show
// the selection made in one of them in the other.

export const CASES = [
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
  { id: 'sentence', label: 'Sentence case' },
  { id: 'title', label: 'Capitalize Each Word' },
];

const isWordChar = (c) => /[\p{L}\p{N}'’]/u.test(c);

/** `text` in another case. `prev` is the text just before it, which shows where words and sentences begin. */
export function caseText(text, mode, prev = '') {
  let out = '';
  let before = prev.slice(-1);
  let sentenceStart = /(^|[.!?]\s)\s*$/.test(prev);
  let sawEnd = /[.!?]$/.test(prev);
  for (const c of text) {
    let r = c;
    if (mode === 'upper') r = c.toUpperCase();
    else if (mode === 'lower') r = c.toLowerCase();
    else if (mode === 'title') r = isWordChar(before) ? c.toLowerCase() : c.toUpperCase();
    else if (mode === 'sentence') {
      if (/\p{L}/u.test(c)) {
        r = sentenceStart ? c.toUpperCase() : c.toLowerCase();
        sentenceStart = sawEnd = false;
      } else if (/[.!?]/.test(c)) sawEnd = true;
      else if (/\s/.test(c)) sentenceStart ||= sawEnd;
      else sentenceStart = sawEnd = false;
    }
    out += r;
    before = c;
  }
  return out;
}

// ---------------------------------------------------------------- in the page

/** Character offsets of `range` in the text of `root`. */
export function rangeOffsets(root, range) {
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return [start, start + range.toString().length];
}

/** A range over the characters `start` to `end` of the text of `root`, or null when the text is shorter. */
export function offsetsRange(root, start, end) {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let begun = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.data.length;
    if (!begun && start <= pos + len) {
      range.setStart(n, start - pos);
      begun = true;
    }
    if (begun && end <= pos + len) {
      range.setEnd(n, end - pos);
      return range;
    }
    pos += len;
  }
  return null;
}

/** Selects the characters `start` to `end` of the text of `root`. */
export function selectOffsets(root, start, end) {
  const range = offsetsRange(root, start, end);
  if (!range) return false;
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/**
 * Changes the case of the text `range` covers inside `root`, keeping its formatting, and selects the changed text.
 * TeX such as \( \frac{a}{b} \) is left alone, since its commands must stay as they are.
 */
export function changeCaseInRange(root, range, mode) {
  const [start, end] = rangeOffsets(root, range);
  const full = root.textContent;
  const keep = new Set();
  for (const m of full.matchAll(/\\\(.*?\\\)|\\\[.*?\\\]|\$\$.*?\$\$/gs)) for (let i = m.index; i < m.index + m[0].length; i++) keep.add(i);
  const piece = (a, b) => [...full.slice(a, b)].map((c, k) => (keep.has(a + k) ? c : caseText(c, mode, full.slice(Math.max(0, a + k - 40), a + k)))).join('');
  // Character by character, each with the text before it, so the result lines up with the text nodes it came from.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let grown = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.data.length;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + len);
    if (a < b) {
      const changed = piece(a, b);
      n.data = n.data.slice(0, a - pos) + changed + n.data.slice(b - pos);
      grown += changed.length - (b - a);
    }
    pos += len;
  }
  selectOffsets(root, start, end + grown);
}
