// Internal question model. Field names follow Moodle XML so that round-trips are lossless.

import { syncDatasets, calculatedIssues } from './calc.js';

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const QUESTION_TYPES = [
  { type: 'multichoice', label: 'Multiple choice', short: 'MC', description: 'Choose one or more answers from a list.' },
  { type: 'truefalse', label: 'True / False', short: 'TF', description: 'A simple choice between True and False.' },
  { type: 'shortanswer', label: 'Short answer', short: 'SA', description: 'Type a word or phrase matched against accepted answers.' },
  { type: 'numerical', label: 'Numerical', short: 'NUM', description: 'Type a number, graded with an optional tolerance.' },
  { type: 'calculated', label: 'Calculated', short: 'CALC', description: 'A formula with random values, so each student gets other numbers.' },
  { type: 'essay', label: 'Essay', short: 'ESS', description: 'Free-text response graded manually.' },
  { type: 'matching', label: 'Matching', short: 'MAT', description: 'Match each sub-question to the correct answer.' },
  { type: 'cloze', label: 'Embedded answers (Cloze)', short: 'CLZ', description: 'Text with embedded gaps of various types.' },
  { type: 'gapselect', label: 'Select missing words', short: 'GS', description: 'Choose missing words from drop-down menus.' },
  { type: 'ddwtos', label: 'Drag and drop into text', short: 'DD', description: 'Drag words into gaps within the text.' },
  { type: 'ordering', label: 'Ordering', short: 'ORD', description: 'Put items into the correct order.' },
  { type: 'description', label: 'Description', short: 'DESC', description: 'Informational text with no response.' },
];

export const TYPE_MAP = Object.fromEntries(QUESTION_TYPES.map((t) => [t.type, t]));

export const TEXT_FORMATS = [
  { value: 'html', label: 'HTML' },
  { value: 'moodle_auto_format', label: 'Moodle auto-format' },
  { value: 'plain_text', label: 'Plain text' },
  { value: 'markdown', label: 'Markdown' },
];

export const DEFAULT_COMBINED_FEEDBACK = {
  correctfeedback: 'Your answer is correct.',
  partiallycorrectfeedback: 'Your answer is partially correct.',
  incorrectfeedback: 'Your answer is incorrect.',
};

export function newAnswer(extra = {}) {
  return { id: uid(), text: '', fraction: 0, feedback: '', ...extra };
}

export function createQuiz() {
  return {
    name: 'Untitled quiz',
    category: '$course$/top/Untitled quiz',
    info: '',
    includeCategory: true,
    defaults: { defaultgrade: 1, penalty: 0.3333333 },
    questions: [],
  };
}

export function createQuestion(type, defaults = {}) {
  const base = {
    id: uid(),
    type,
    name: '',
    questiontext: '',
    questiontextformat: 'html',
    generalfeedback: '',
    defaultgrade: defaults.defaultgrade ?? 1,
    penalty: defaults.penalty ?? 0.3333333,
    hidden: false,
    idnumber: '',
    category: '',
    tags: [],
    hints: [],
  };
  const combined = { ...DEFAULT_COMBINED_FEEDBACK, shownumcorrect: true };
  switch (type) {
    case 'multichoice':
      return {
        ...base,
        ...combined,
        single: true,
        shuffleanswers: true,
        answernumbering: 'abc',
        showstandardinstruction: false,
        answers: [newAnswer({ fraction: 100 }), newAnswer(), newAnswer(), newAnswer()],
      };
    case 'truefalse':
      return { ...base, penalty: 1, correct: true, feedbacktrue: '', feedbackfalse: '' };
    case 'shortanswer':
      return { ...base, usecase: false, answers: [newAnswer({ fraction: 100 })] };
    case 'numerical':
      return {
        ...base,
        answers: [newAnswer({ fraction: 100, tolerance: 0 })],
        units: [],
        unitgradingtype: 0,
        unitpenalty: 0.1,
        showunits: 3,
        unitsleft: false,
      };
    case 'calculated': {
      const q = {
        ...base,
        questiontext: '<p>A rectangle is {a} m long and {b} m wide. What is its area in m²?</p>',
        answers: [newAnswer({ text: '{a} * {b}', fraction: 100, tolerance: 0.01, tolerancetype: 1, correctanswerformat: 1, correctanswerlength: 2 })],
        units: [],
        unitgradingtype: 0,
        unitpenalty: 0.1,
        showunits: 3,
        unitsleft: false,
        synchronize: 0,
        itemcount: 10,
        datasets: [],
      };
      syncDatasets(q);
      return q;
    }
    case 'essay':
      return {
        ...base,
        penalty: 0,
        responseformat: 'editor',
        responserequired: true,
        responsefieldlines: 15,
        minwordlimit: '',
        maxwordlimit: '',
        attachments: 0,
        attachmentsrequired: 0,
        maxbytes: 0,
        filetypeslist: '',
        graderinfo: '',
        responsetemplate: '',
      };
    case 'matching':
      return {
        ...base,
        ...combined,
        shuffleanswers: true,
        subquestions: [
          { id: uid(), text: '', answer: '' },
          { id: uid(), text: '', answer: '' },
          { id: uid(), text: '', answer: '' },
        ],
      };
    case 'cloze':
      return { ...base, defaultgrade: 1, questiontext: '<p>The capital of France is {1:SHORTANSWER:=Paris}.</p>' };
    case 'gapselect':
    case 'ddwtos':
      return {
        ...base,
        ...combined,
        questiontext: '<p>The [[1]] sat on the [[2]].</p>',
        shuffleanswers: true,
        choices: [
          { id: uid(), text: 'cat', group: 1, infinite: false },
          { id: uid(), text: 'mat', group: 1, infinite: false },
          { id: uid(), text: 'dog', group: 1, infinite: false },
        ],
      };
    case 'ordering':
      return {
        ...base,
        ...combined,
        layouttype: 'VERTICAL',
        selecttype: 'ALL',
        selectcount: 0,
        gradingtype: 'ABSOLUTE_POSITION',
        showgrading: true,
        numberingstyle: 'none',
        items: [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }],
      };
    case 'description':
      return { ...base, defaultgrade: 0, penalty: 0 };
    default:
      throw new Error('Unknown question type: ' + type);
  }
}

/** Deep-copies a question and gives it (and its nested rows) fresh ids. */
export function cloneQuestion(q) {
  const copy = JSON.parse(JSON.stringify(q));
  copy.id = uid();
  for (const key of ['answers', 'subquestions', 'choices', 'items', 'hints', 'datasets']) {
    if (Array.isArray(copy[key])) copy[key].forEach((row) => row && typeof row === 'object' && (row.id = uid()));
  }
  return copy;
}

/** Fills in any fields missing from a partially specified question (e.g. from an importer). */
export function normalizeQuestion(partial, defaults) {
  const q = { ...createQuestion(partial.type, defaults), ...partial };
  if (!q.id) q.id = uid();
  for (const key of ['answers', 'subquestions', 'choices', 'items', 'datasets']) {
    if (Array.isArray(q[key])) q[key] = q[key].map((row) => ({ id: uid(), ...row }));
  }
  q.hints = (q.hints || []).map((h) => (typeof h === 'string' ? { id: uid(), text: h } : { id: uid(), ...h }));
  q.tags = q.tags || [];
  // An imported question may come without generated values (an AI is told to leave them out).
  if (q.type === 'calculated') syncDatasets(q);
  return q;
}

export function normalizeQuiz(raw) {
  const quiz = { ...createQuiz(), ...raw };
  quiz.defaults = { ...createQuiz().defaults, ...(raw.defaults || {}) };
  quiz.questions = (raw.questions || []).filter((q) => TYPE_MAP[q.type]).map((q) => normalizeQuestion(q, quiz.defaults));
  return quiz;
}

export function stripHtml(html) {
  if (!html) return '';
  const text = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text).replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return named[e.toLowerCase()] ?? m;
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Short human-readable label for a question in lists. */
export function questionTitle(q) {
  if (q.name?.trim()) return q.name.trim();
  const text = stripHtml(q.questiontext).replace(/\s+/g, ' ');
  return text ? text.slice(0, 80) : 'Untitled question';
}

/** Returns a list of human-readable problems with a question. */
export function validateQuestion(q) {
  const issues = [];
  if (q.type !== 'description' && !stripHtml(q.questiontext) && !/<img/i.test(q.questiontext)) issues.push('Question text is empty.');
  const nonEmpty = (rows) => (rows || []).filter((a) => stripHtml(a.text) !== '' || /<img/i.test(a.text || ''));
  switch (q.type) {
    case 'multichoice': {
      const answers = nonEmpty(q.answers);
      if (answers.length < 2) issues.push('At least two answers are required.');
      if (q.single) {
        if (!answers.some((a) => Number(a.fraction) === 100)) issues.push('One answer must be worth 100%.');
      } else {
        const sum = answers.filter((a) => a.fraction > 0).reduce((s, a) => s + Number(a.fraction), 0);
        if (Math.abs(sum - 100) > 0.5) issues.push(`Positive grades add up to ${round(sum)}% (should be 100%).`);
      }
      break;
    }
    case 'shortanswer':
      if (!nonEmpty(q.answers).length) issues.push('At least one answer is required.');
      else if (!q.answers.some((a) => Number(a.fraction) === 100)) issues.push('One answer must be worth 100%.');
      break;
    case 'numerical':
      if (!q.answers.some((a) => String(a.text).trim() !== '')) issues.push('At least one answer is required.');
      if (q.answers.some((a) => a.text !== '*' && String(a.text).trim() !== '' && !Number.isFinite(Number(a.text))))
        issues.push('Answers must be numbers (or * for any).');
      if (!q.answers.some((a) => Number(a.fraction) === 100)) issues.push('One answer must be worth 100%.');
      break;
    case 'calculated':
      if (!q.answers.some((a) => String(a.text).trim() !== '')) issues.push('At least one answer formula is required.');
      else if (!q.answers.some((a) => Number(a.fraction) === 100)) issues.push('One answer must be worth 100%.');
      if (!q.datasets?.length) issues.push('The question has no wildcards such as {a}, so every student gets the same numbers.');
      issues.push(...calculatedIssues(q));
      break;
    case 'matching': {
      const withQ = q.subquestions.filter((s) => stripHtml(s.text));
      if (withQ.length < 2) issues.push('At least two sub-questions are required.');
      if (withQ.some((s) => !s.answer.trim())) issues.push('Every sub-question needs an answer.');
      break;
    }
    case 'gapselect':
    case 'ddwtos': {
      const refs = [...(q.questiontext || '').matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
      if (!refs.length) issues.push('The text has no [[n]] placeholders.');
      const bad = refs.filter((n) => n < 1 || n > q.choices.length);
      if (bad.length) issues.push(`Placeholder(s) ${[...new Set(bad)].map((n) => `[[${n}]]`).join(', ')} refer to missing choices.`);
      break;
    }
    case 'ordering':
      if (nonEmpty(q.items).length < 2) issues.push('At least two items are required.');
      break;
    case 'cloze':
      if (!/\{\d*:[A-Z_]+:/.test(q.questiontext || '')) issues.push('No embedded {…} answers found.');
      break;
  }
  return issues;
}

export function round(n, digits = 4) {
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

/** Valid Moodle grade fractions (as percentages). */
export const FRACTIONS = [
  100, 90, 83.33333, 80, 75, 70, 66.66667, 60, 50, 40, 33.33333, 30, 25, 20, 16.66667, 14.28571, 12.5, 11.11111, 10, 5, 0,
];

/** Penalty per wrong try, as a fraction of the mark. */
export const PENALTIES = [
  { value: 1, label: '100%' },
  { value: 0.5, label: '50%' },
  { value: 0.3333333, label: '33.33%' },
  { value: 0.25, label: '25%' },
  { value: 0.2, label: '20%' },
  { value: 0.1, label: '10%' },
  { value: 0, label: '0%' },
];

export function fractionLabel(f) {
  const n = Number(f);
  if (n === 0) return 'None';
  // Display only: the stored value keeps full precision for export.
  return `${round(n, 2)}%`;
}

export function moveItem(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}
