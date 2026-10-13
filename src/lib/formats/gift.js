// GIFT import/export. Reference: https://docs.moodle.org/en/GIFT_format
// Supports: multichoice, truefalse, shortanswer, numerical, essay, matching, description (and missing-word).

import { uid, round, escapeHtml, stripHtml, questionTitle } from '../model.js';

const SPECIAL = ['\\', ':', '#', '=', '~', '{', '}'];
const PH_BASE = 0xe000;
const toPH = (ch) => String.fromCharCode(PH_BASE + SPECIAL.indexOf(ch));
const PH_RE = new RegExp(`[\\u${PH_BASE.toString(16)}-\\u${(PH_BASE + SPECIAL.length - 1).toString(16)}]`, 'g');

/** Replaces escaped GIFT characters with private-use placeholders so they don't act as syntax. */
function protect(s) {
  return s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : SPECIAL.includes(c) ? toPH(c) : m));
}
/** Restores placeholders to their literal characters. */
function restore(s) {
  return s.replace(PH_RE, (c) => SPECIAL[c.charCodeAt(0) - PH_BASE]);
}

const looksLikeHtml = (s) => /<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(s);

/** Converts imported text in the given GIFT format into HTML for the editor. */
function toHtml(s, format) {
  s = s.trim();
  if (format === 'html') return s;
  if (format !== 'markdown' && looksLikeHtml(s)) return s;
  return escapeHtml(s).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------- import

export function importGift(src) {
  const warnings = [];
  const questions = [];
  let category = '';
  let currentCategory = '';

  const lines = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = [];
  for (const line of lines) {
    if (/^\s*\/\//.test(line)) continue;
    if (line.trim() === '') {
      if (cur.length) blocks.push(cur), (cur = []);
    } else cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  for (let blockLines of blocks) {
    while (blockLines.length && /^\s*\$CATEGORY:/i.test(blockLines[0])) {
      currentCategory = blockLines[0].replace(/^\s*\$CATEGORY:/i, '').trim();
      if (!category) category = currentCategory;
      blockLines = blockLines.slice(1);
    }
    if (!blockLines.length) continue;
    const raw = blockLines.join('\n');
    try {
      const q = parseQuestion(raw, warnings);
      if (q) {
        if (currentCategory && currentCategory !== category) q.category = currentCategory;
        questions.push(q);
      }
    } catch (e) {
      warnings.push(`Could not parse question "${raw.slice(0, 60)}…": ${e.message}`);
    }
  }

  const quiz = category ? { category, name: category.split('/').pop() } : {};
  return { quiz, questions, warnings };
}

function parseQuestion(raw, warnings) {
  let text = protect(raw.trim());
  let name = '';

  const title = /^::([\s\S]*?)::/.exec(text);
  if (title) {
    name = restore(title[1]).trim();
    text = text.slice(title[0].length).trim();
  }

  let format = 'moodle';
  const fm = /^\[(html|moodle|plain|markdown)\]/i.exec(text);
  if (fm) {
    format = fm[1].toLowerCase();
    text = text.slice(fm[0].length);
  }

  const start = text.indexOf('{');
  const base = {
    id: uid(),
    name,
    questiontextformat: format === 'markdown' ? 'markdown' : 'html',
    generalfeedback: '',
    tags: [],
    hints: [],
  };
  const conv = (s) => (format === 'markdown' ? restore(s).trim() : toHtml(restore(s), format));

  if (start === -1) {
    return { ...base, type: 'description', questiontext: conv(text), defaultgrade: 0, penalty: 0 };
  }
  const end = text.indexOf('}', start);
  if (end === -1) throw new Error('missing closing "}"');

  const before = text.slice(0, start);
  const after = text.slice(end + 1);
  let answer = text.slice(start + 1, end).trim();
  base.questiontext = conv(after.trim() ? `${before.trimEnd()} _____ ${after.trimStart()}` : before);

  const gf = answer.indexOf('####');
  if (gf !== -1) {
    base.generalfeedback = conv(answer.slice(gf + 4));
    answer = answer.slice(0, gf).trim();
  }

  const answerHtml = (s) => conv(s);
  const plain = (s) => restore(s).trim();

  if (answer === '') return { ...base, type: 'essay', penalty: 0 };

  if (answer[0] === '#') return { ...base, type: 'numerical', ...parseNumerical(answer.slice(1)) };

  if (answer.includes('~')) {
    const answers = splitAnswers(answer).map((a) => {
      const { fraction, text, feedback } = parseAnswerItem(a);
      return { id: uid(), text: answerHtml(text), fraction, feedback: feedback ? conv(feedback) : '' };
    });
    const full = answers.filter((a) => a.fraction === 100).length;
    return {
      ...base,
      type: 'multichoice',
      single: full === 1,
      shuffleanswers: true,
      answernumbering: 'abc',
      showstandardinstruction: false,
      answers,
    };
  }

  if (answer.includes('=') && answer.includes('->')) {
    const pairs = answer
      .split('=')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf('->');
        if (idx === -1) throw new Error(`matching pair "${restore(p)}" is missing "->"`);
        return { id: uid(), text: answerHtml(p.slice(0, idx)), answer: plain(p.slice(idx + 2)) };
      });
    return { ...base, type: 'matching', shuffleanswers: true, subquestions: pairs };
  }

  const tf = /^(T|TRUE|F|FALSE)\s*(#|$)/i.exec(answer);
  if (tf) {
    const parts = answer.split('#');
    const correct = /^t/i.test(parts[0].trim());
    const wrongFb = parts[1] ? conv(parts[1]) : '';
    const rightFb = parts[2] ? conv(parts[2]) : '';
    return {
      ...base,
      type: 'truefalse',
      penalty: 1,
      correct,
      feedbacktrue: correct ? rightFb : wrongFb,
      feedbackfalse: correct ? wrongFb : rightFb,
    };
  }

  const answers = splitAnswers(answer).map((a) => {
    const { fraction, text, feedback } = parseAnswerItem(a);
    return { id: uid(), text: plain(text), fraction, feedback: feedback ? conv(feedback) : '' };
  });
  if (!answers.length) throw new Error('no answers found');
  return { ...base, type: 'shortanswer', usecase: false, answers };
}

function splitAnswers(s) {
  return s
    .split(/(?=[=~])/)
    .map((x) => x.trim())
    .filter((x) => x && x !== '=' && x !== '~');
}

function parseAnswerItem(a) {
  let fraction = a[0] === '=' ? 100 : 0;
  let rest = a.slice(1);
  const w = /^\s*%(-?\d+(?:\.\d+)?)%/.exec(rest);
  if (w) {
    fraction = parseFloat(w[1]);
    rest = rest.slice(w[0].length);
  }
  const hash = rest.indexOf('#');
  const text = hash === -1 ? rest : rest.slice(0, hash);
  const feedback = hash === -1 ? '' : rest.slice(hash + 1);
  return { fraction, text: text.trim(), feedback: feedback.trim() };
}

function parseNumerical(body) {
  const items = body.includes('=') ? splitAnswers(body) : ['=' + body];
  const answers = items.map((item) => {
    const { fraction, text, feedback } = parseAnswerItem(item);
    const t = restore(text).trim();
    let value = t;
    let tolerance = 0;
    const range = /^(-?[\d.eE+-]+)\s*\.\.\s*(-?[\d.eE+-]+)$/.exec(t);
    if (range) {
      const min = parseFloat(range[1]);
      const max = parseFloat(range[2]);
      value = String(round((min + max) / 2, 10));
      tolerance = round(Math.abs(max - min) / 2, 10);
    } else if (t.includes(':')) {
      const [v, tol] = t.split(':');
      value = v.trim();
      tolerance = parseFloat(tol) || 0;
    }
    return { id: uid(), text: value, tolerance, fraction, feedback: feedback ? toHtml(restore(feedback), 'moodle') : '' };
  });
  return { answers, units: [], unitgradingtype: 0, unitpenalty: 0.1, showunits: 3, unitsleft: false };
}

// ---------------------------------------------------------------- export

const GIFT_TYPES = new Set(['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay', 'matching', 'description']);

export function giftEscape(s) {
  return String(s ?? '')
    .replace(/\r/g, '')
    .replace(/[\\:#=~{}]/g, (c) => '\\' + c)
    .replace(/\n/g, '\\n');
}

function giftText(text) {
  return giftEscape(String(text ?? '').trim());
}

const pct = (f) => String(round(f, 5));

export function exportGift(quiz, questions = quiz.questions) {
  const warnings = [];
  const out = [];
  let lastCategory = null;

  for (const q of questions) {
    if (!GIFT_TYPES.has(q.type)) {
      warnings.push(`"${q.name || stripHtml(q.questiontext).slice(0, 40)}" was skipped: ${q.type} questions are not supported by GIFT.`);
      continue;
    }
    if (quiz.includeCategory) {
      const cat = q.category?.trim() || quiz.category;
      if (cat && cat !== lastCategory) {
        out.push(`$CATEGORY: ${cat}`, '');
        lastCategory = cat;
      }
    }
    if (q.hints?.some((h) => h.text?.trim()) || q.tags?.length) {
      warnings.push(`"${q.name || 'Untitled'}": hints and tags cannot be represented in GIFT and were omitted.`);
    }
    out.push(`// question: ${questionTitle(q).replace(/\n/g, ' ')}`, writeQuestion(q, warnings), '');
  }
  return { text: out.join('\n'), warnings };
}

function writeQuestion(q, warnings) {
  const fmt = q.questiontextformat === 'markdown' ? 'markdown' : q.questiontextformat === 'plain_text' ? 'plain' : q.questiontextformat === 'moodle_auto_format' ? 'moodle' : 'html';
  const title = q.name ? `::${giftEscape(q.name)}::` : '';
  const qtext = `[${fmt}]` + giftText(q.questiontext || '', fmt);
  const fb = (s) => (s && stripHtml(s) !== '' ? giftText(s, fmt) : '');
  const gfb = fb(q.generalfeedback) ? `####${fb(q.generalfeedback)}` : '';

  let answers;
  switch (q.type) {
    case 'description':
      return title + qtext;
    case 'essay':
      answers = gfb ? gfb : '';
      break;
    case 'truefalse': {
      const right = fb(q.correct ? q.feedbacktrue : q.feedbackfalse);
      const wrong = fb(q.correct ? q.feedbackfalse : q.feedbacktrue);
      answers = (q.correct ? 'TRUE' : 'FALSE') + (wrong || right ? `#${wrong}` : '') + (right ? `#${right}` : '') + gfb;
      break;
    }
    case 'multichoice': {
      const lines = q.answers
        .filter((a) => stripHtml(a.text) !== '' || /<img/i.test(a.text))
        .map((a) => {
          const f = Number(a.fraction);
          const prefix = q.single && f === 100 ? '=' : f === 0 && q.single ? '~' : `~%${pct(f)}%`;
          return `\t${prefix}${giftText(a.text, fmt)}${fb(a.feedback) ? `#${fb(a.feedback)}` : ''}`;
        });
      answers = '\n' + lines.join('\n') + (gfb ? `\n\t${gfb}` : '') + '\n';
      break;
    }
    case 'shortanswer': {
      if (q.usecase) warnings.push(`"${q.name || 'Untitled'}": case sensitivity cannot be represented in GIFT.`);
      const lines = q.answers
        .filter((a) => String(a.text).trim() !== '')
        .map((a) => `\t=${Number(a.fraction) === 100 ? '' : `%${pct(a.fraction)}%`}${giftEscape(a.text)}${fb(a.feedback) ? `#${fb(a.feedback)}` : ''}`);
      answers = '\n' + lines.join('\n') + (gfb ? `\n\t${gfb}` : '') + '\n';
      break;
    }
    case 'numerical': {
      if (q.units?.length) warnings.push(`"${q.name || 'Untitled'}": units cannot be represented in GIFT and were omitted.`);
      const valid = q.answers.filter((a) => String(a.text).trim() !== '');
      const item = (a) => `${giftEscape(String(a.text).trim())}${Number(a.tolerance) ? `:${Number(a.tolerance)}` : ''}${fb(a.feedback) ? `#${fb(a.feedback)}` : ''}`;
      if (valid.length === 1 && Number(valid[0].fraction) === 100) answers = `#${item(valid[0])}${gfb}`;
      else answers = '#\n' + valid.map((a) => `\t=${Number(a.fraction) === 100 ? '' : `%${pct(a.fraction)}%`}${item(a)}`).join('\n') + (gfb ? `\n\t${gfb}` : '') + '\n';
      break;
    }
    case 'matching': {
      const lines = q.subquestions
        .filter((s) => stripHtml(s.text) !== '' || s.answer.trim() !== '')
        .map((s) => `\t=${giftText(s.text, fmt)} -> ${giftEscape(s.answer)}`);
      answers = '\n' + lines.join('\n') + (gfb ? `\n\t${gfb}` : '') + '\n';
      break;
    }
  }

  // Missing-word style: put the answer block where the blank is, if the text has one.
  const blank = /_{3,}/;
  if (q.type !== 'essay' && blank.test(qtext)) {
    const [pre, ...rest] = qtext.split(blank);
    return `${title}${pre.trimEnd()} {${answers}} ${rest.join('_____').trimStart()}`.trimEnd();
  }
  return `${title}${qtext}{${answers}}`;
}
