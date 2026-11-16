// Paper exams: versions of a quiz with the questions and answers in another order (A, B, C, D), a bubble answer
// sheet for the multiple-choice and true/false questions, and marking filled-in sheets.
//
// The order of each version comes from a random generator seeded with the questions' IDs, so printing again gives
// the same versions as long as the questions stay the same. An answer sheet is laid out in millimetres, measured
// from the centre of its top-left corner marker; the four markers let a photo of the sheet be read (see omr.js). A row
// of small squares at the top encodes which version and page the sheet is, and a check number of the questions.

import { escapeHtml, stripHtml, round } from './model.js';
import { isPinned } from './quality.js';

export const VERSION_LABELS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------- versions

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Answers like "A and C" name others by their letter, so a question with one is never reordered.
const NAMES_LETTERS = /\b[a-e],? (dan|and|&) [a-e]\b/i;

/** The answers printed for a multiple-choice question: the empty ones are left out. */
export const shownAnswers = (q) => q.answers.filter((a) => stripHtml(a.text) || /<img/i.test(a.text));

/** Shuffles a question's answers, keeping answers such as "All of the above" where they are. */
function shuffleAnswers(q, rand) {
  if (q.type !== 'multichoice' || q.shuffleanswers === false || q.answers.some((a) => NAMES_LETTERS.test(stripHtml(a.text)))) return q;
  const free = q.answers.map((a, i) => (isPinned(a) ? -1 : i)).filter((i) => i >= 0);
  const moved = shuffle(free.map((i) => q.answers[i]), rand);
  return { ...q, answers: q.answers.map((a, i) => (free.includes(i) ? moved[free.indexOf(i)] : a)) };
}

/**
 * The versions of an exam: [{ label, questions }]. One version is the questions as they are. Questions move only
 * between descriptions, so a description stays in front of the questions it introduces.
 */
export function makeVersions(questions, count = 1, { shuffleQuestions = true, shuffleAnswers: answers = true } = {}) {
  if (count <= 1) return [{ label: '', questions }];
  const seed = hashString(questions.map((q) => q.id).join(','));
  return VERSION_LABELS.slice(0, count).map((label, v) => {
    const rand = random(seed + v * 7919);
    const out = [];
    let section = [];
    const flush = () => {
      out.push(...(shuffleQuestions ? shuffle(section, rand) : section));
      section = [];
    };
    for (const q of questions) {
      if (q.type === 'description') {
        flush();
        out.push(q);
      } else section.push(q);
    }
    flush();
    return { label, questions: answers ? out.map((q) => shuffleAnswers(q, rand)) : out };
  });
}

/** A number from 0 to 255 that changes with the questions and version settings, printed on answer sheets. */
export function examCheck(questions, count, options = {}) {
  const parts = questions.map((q) => `${q.id}:${(q.answers ?? []).map((a) => a.id).join('.')}`);
  return hashString(`${parts.join(',')}|${count}|${options.shuffleQuestions !== false}|${options.shuffleAnswers !== false}`) & 255;
}

// ---------------------------------------------------------------- print settings

const PREFS_KEY = 'mqe.print';

/** The print dialog's settings, which marking uses too. */
export function loadPrintPrefs() {
  let p = {};
  try {
    p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    /* defaults */
  }
  return {
    answers: ['none', 'inline', 'key'].includes(p.answers) ? p.answers : 'none',
    marks: p.marks ?? true,
    studentFields: p.studentFields ?? true,
    feedback: p.feedback ?? false,
    paper: ['a4', 'f4', 'letter'].includes(p.paper) ? p.paper : 'a4',
    versions: [1, 2, 3, 4].includes(p.versions) ? p.versions : 1,
    shuffleQuestions: p.shuffleQuestions ?? true,
    shuffleAnswers: p.shuffleAnswers ?? true,
    sheet: ['none', 'after', 'only'].includes(p.sheet) ? p.sheet : 'none',
  };
}

export function savePrintPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Everything about an exam's versions that printing and marking share. */
export function examSetup(questions, { versions = 1, shuffleQuestions = true, shuffleAnswers = true } = {}) {
  const options = { shuffleQuestions, shuffleAnswers };
  const list = makeVersions(questions, versions, options);
  return { versions: list, check: examCheck(questions, versions, options), items: list.map((v) => sheetItems(v.questions)) };
}

// ---------------------------------------------------------------- answer sheet

export function answerLabel(i, style) {
  switch (style) {
    case 'ABCD':
      return String.fromCharCode(65 + i);
    case '123':
      return String(i + 1);
    case 'iii':
      return ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i];
    case 'IIII':
      return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i];
    case 'none':
      return String.fromCharCode(65 + i);
    default:
      return String.fromCharCode(97 + i);
  }
}

/** Most bubbles in a row; a question with more answers is left off the sheet. */
export const MAX_OPTIONS = 8;

/**
 * The questions that go on the answer sheet, in paper order: [{ number, q, labels, multi, fractions }].
 * `number` is the question's number on the paper; `fractions` the grade of each bubble (percent).
 */
export function sheetItems(questions) {
  const items = [];
  let n = 0;
  for (const q of questions) {
    if (q.type === 'description') continue;
    n++;
    if (q.type === 'truefalse') items.push({ number: n, q, labels: ['T', 'F'], multi: false, fractions: q.correct ? [100, 0] : [0, 100] });
    else if (q.type === 'multichoice') {
      const shown = shownAnswers(q);
      if (shown.length < 2 || shown.length > MAX_OPTIONS) continue;
      items.push({ number: n, q, labels: shown.map((_, i) => answerLabel(i, q.answernumbering)), multi: !q.single, fractions: shown.map((a) => Number(a.fraction) || 0) });
    }
  }
  return items;
}

// Sizes in millimetres.
export const SHEET = {
  marker: 10, // corner marker side
  code: 3.4, // code square side
  codePitch: 5,
  bubble: 4.8,
  pitch: 6.4, // bubble to bubble
  row: 7.2,
  numberWidth: 10,
  gap: 5, // between columns
  top: 38, // first row, below the header
  bottom: 9, // space kept above the bottom markers' centres
};
export const CODE_BITS = 14;

/** The code squares' bits: always 1, version (2 bits), page (2 bits), check (8 bits), always 0. */
export function codeBits(version, page, check) {
  const bits = [1, (version >> 1) & 1, version & 1, (page >> 1) & 1, page & 1];
  for (let b = 7; b >= 0; b--) bits.push((check >> b) & 1);
  bits.push(0);
  return bits;
}

/** Reads code bits back; null when they can't be a code (such as a sheet read upside down). */
export function readCode(bits) {
  if (bits.length !== CODE_BITS || bits[0] !== 1 || bits[CODE_BITS - 1] !== 0) return null;
  return { version: bits[1] * 2 + bits[2], page: bits[3] * 2 + bits[4], check: bits.slice(5, 13).reduce((n, b) => n * 2 + b, 0) };
}

/** The frame between the markers' centres, for a sheet that fills a page's printable area. */
export function sheetFrame(width, height) {
  return { width: width - SHEET.marker, height: height - SHEET.marker };
}

/** Where the code squares' centres are, in the frame. */
export const codePositions = (frame) => {
  const start = frame.width / 2 - ((CODE_BITS - 1) * SHEET.codePitch) / 2;
  return Array.from({ length: CODE_BITS }, (_, i) => ({ x: start + i * SHEET.codePitch, y: 0 }));
};

/** Places where the paper is always blank, to measure its brightness. */
export const blankPositions = (frame) => [
  { x: SHEET.marker, y: 0 },
  { x: frame.width - SHEET.marker, y: 0 },
  { x: SHEET.marker, y: frame.height },
  { x: frame.width - SHEET.marker, y: frame.height },
];

/**
 * Lays the sheet items out on pages: [{ items: [{ item, index, x, y, bubbles: [{ x, y }] }] }], positions being the
 * centres in the frame. `index` is the item's place in `items`.
 */
export function sheetPages(items, frame) {
  const pages = [];
  let at = 0;
  while (at < items.length || !pages.length) {
    const rows = Math.max(1, Math.floor((frame.height - SHEET.top - SHEET.bottom) / SHEET.row));
    // As many columns as the widest row on this page allows; recounted when a wider question comes along.
    let width = 2;
    let take = 0;
    for (let i = at; i < items.length; i++) {
      const w = Math.max(width, items[i].labels.length);
      const cols = Math.max(1, Math.floor((frame.width + SHEET.gap) / (SHEET.numberWidth + w * SHEET.pitch + SHEET.gap)));
      if (i - at + 1 > cols * rows) break;
      width = w;
      take++;
    }
    const colWidth = SHEET.numberWidth + width * SHEET.pitch + SHEET.gap;
    const placed = items.slice(at, at + take).map((item, k) => {
      const x = Math.floor(k / rows) * colWidth;
      const y = SHEET.top + (k % rows) * SHEET.row + SHEET.row / 2;
      return { item, index: at + k, x, y, bubbles: item.labels.map((_, j) => ({ x: x + SHEET.numberWidth + j * SHEET.pitch + SHEET.pitch / 2, y })) };
    });
    pages.push({ items: placed });
    at += take;
    if (!take) break;
  }
  return pages;
}

const mm = (n) => `${round(n, 3)}mm`;

/**
 * The answer sheet pages of one version, as HTML. `size` is the printable area in mm; `show` fills the correct
 * bubbles, for a marking overlay.
 */
export function sheetHtml({ title, label, version, check, size, items, show = false }) {
  const frame = sheetFrame(size.width, size.height);
  const pages = sheetPages(items, frame);
  const o = SHEET.marker / 2;
  const at = (x, y) => `left:${mm(o + x)};top:${mm(o + y)}`;
  return pages
    .map((page, p) => {
      const markers = [
        [0, 0],
        [frame.width, 0],
        [0, frame.height],
        [frame.width, frame.height],
      ]
        .map(([x, y]) => `<span class="mk" style="${at(x, y)}"></span>`)
        .join('');
      const code = codeBits(version, p, check)
        .map((b, i) => `<span class="cd${b ? ' on' : ''}" style="${at(codePositions(frame)[i].x, 0)}"></span>`)
        .join('');
      const rows = page.items
        .map(({ item, x, y, bubbles }) => {
          const marks = bubbles
            .map((b, j) => `<span class="bb${show && item.fractions[j] > 0 ? ' on' : ''}" style="${at(b.x, b.y)}">${escapeHtml(item.labels[j])}</span>`)
            .join('');
          return `<span class="no" style="${at(x, y)}">${item.number}${item.multi ? '<sup>+</sup>' : ''}</span>${marks}`;
        })
        .join('');
      const pageText = pages.length > 1 ? ` · Sheet ${p + 1} of ${pages.length}` : '';
      const head = `<div class="sh-head" style="left:${mm(SHEET.marker + 4)};right:${mm(SHEET.marker + 4)};top:${mm(o + 7)}">
<div class="sh-title"><strong>${escapeHtml(title)}</strong>${label ? `<span class="sh-ver">Version ${escapeHtml(label)}</span>` : ''}</div>
<div class="sh-fields"><span class="name">Name: <span class="blank"></span></span><span>ID: <span class="blank"></span></span></div>
<div class="sh-note">Answer sheet${pageText}. Fill the circle of your answer completely with a dark pen or pencil, and erase changes fully.${items.some((i) => i.multi) ? ' <sup>+</sup> More than one answer may be correct.' : ''}</div></div>`;
      const empty = items.length ? '' : `<p class="sh-empty" style="${at(SHEET.marker, SHEET.top)}">This quiz has no multiple-choice or true/false questions for an answer sheet.</p>`;
      return `<section class="sheet-page" style="height:${mm(size.height)}">${markers}${code}${head}${rows}${empty}</section>`;
    })
    .join('');
}

export const SHEET_CSS = `
.sheet-page { position: relative; break-before: page; break-inside: avoid; overflow: hidden; }
.sheet-page > span { position: absolute; transform: translate(-50%, -50%); }
.mk { width: ${SHEET.marker}mm; height: ${SHEET.marker}mm; background: #000; }
.cd { width: ${SHEET.code}mm; height: ${SHEET.code}mm; border: .3mm solid #000; }
.cd.on { background: #000; }
.bb { width: ${SHEET.bubble}mm; height: ${SHEET.bubble}mm; border: .3mm solid #333; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5mm; line-height: 1; color: #888; }
.bb.on { background: #0a6b2f; border-color: #0a6b2f; color: #fff; }
.no { transform: translate(0, -50%) !important; font-weight: 700; font-size: 3.4mm; }
.no sup { font-size: 2.4mm; }
.sh-head { position: absolute; }
.sh-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; font-size: 13pt; }
.sh-ver { font-weight: 700; font-size: 15pt; border: 1pt solid #000; padding: 0 6pt; }
.sh-fields { display: flex; gap: 22pt; margin-top: 7pt; }
.sh-fields > span { flex: 1 1 9em; display: flex; align-items: baseline; gap: 4pt; white-space: nowrap; }
.sh-fields > .name { flex-grow: 2.4; }
.sh-fields .blank { flex: 1; }
.sh-note { margin-top: 5pt; font-size: 8.5pt; color: #444; }
.sh-empty { position: absolute; margin: 0; color: #555; }
@media screen {
  html:not(.pdf) .sheet-page { margin-top: 28px; outline: 1px dashed #bbb; outline-offset: 6px; }
}
`;

// ---------------------------------------------------------------- marking

/**
 * Reads typed answers, one per sheet question in order. With spaces or commas between them an answer can have
 * several letters ("A, BD, -"); without, every character is one answer ("ABDCA"). Letters and numbers count from 1
 * (A or 1 is the first answer); T/B is true and F/S is false; "-" or "?" is no answer.
 */
export function parseTyped(text, items) {
  const raw = text.trim();
  const tokens = /[\s,;]/.test(raw) ? raw.split(/[\s,;]+/).filter(Boolean) : [...raw];
  return items.map((item, i) => {
    const picked = new Set();
    for (const c of (tokens[i] ?? '').toLowerCase()) {
      let k = -1;
      if (item.labels[0] === 'T') k = 'tb'.includes(c) ? 0 : 'fs'.includes(c) ? 1 : -1;
      else if (/[a-z]/.test(c)) k = c.charCodeAt(0) - 97;
      else if (/[1-9]/.test(c)) k = Number(c) - 1;
      if (k >= 0 && k < item.labels.length) picked.add(k);
    }
    return picked;
  });
}

/** Answers written back as text that parseTyped reads again. */
export function formatAnswers(answers, items) {
  return items
    .map((item, i) => {
      const picked = [...(answers[i] ?? [])].sort((a, b) => a - b);
      if (!picked.length) return '-';
      return picked.map((k) => (item.labels[0] === 'T' ? item.labels[k] : String.fromCharCode(65 + k))).join('');
    })
    .join(' ');
}

/** The share of a question's mark that an answer earns, from 0 to 1, as Moodle grades it. */
export function answerScore(item, picked) {
  if (!picked.size) return 0;
  if (!item.multi) return picked.size === 1 ? Math.max(0, item.fractions[[...picked][0]] / 100) : 0;
  const sum = [...picked].reduce((s, k) => s + (item.fractions[k] ?? 0), 0);
  return Math.min(1, Math.max(0, sum / 100));
}

/** Marks one student's answers: { score, max, perItem: [marks] }. */
export function markSheet(items, answers) {
  let score = 0;
  let max = 0;
  const perItem = items.map((item, i) => {
    const mark = Number(item.q.defaultgrade) || 0;
    const got = answerScore(item, answers[i] ?? new Set()) * mark;
    score += got;
    max += mark;
    return round(got, 2);
  });
  return { score: round(score, 2), max: round(max, 2), perItem };
}
