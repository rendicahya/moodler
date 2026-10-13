// Helpers for Moodle "Embedded answers (Cloze)" syntax: {weight:TYPE:answers}
// Reference: https://docs.moodle.org/en/Embedded_Answers_(Cloze)_question_type

import { uid, escapeHtml } from '../model.js';

export const CLOZE_TYPES = [
  { value: 'SHORTANSWER', label: 'Short answer', aliases: ['SA', 'MW'] },
  { value: 'SHORTANSWER_C', label: 'Short answer (case sensitive)', aliases: ['SAC', 'MWC'] },
  { value: 'NUMERICAL', label: 'Numerical', aliases: ['NM'] },
  { value: 'MULTICHOICE', label: 'Multiple choice (drop-down)', aliases: ['MC'] },
  { value: 'MULTICHOICE_V', label: 'Multiple choice (vertical radio)', aliases: ['MCV'] },
  { value: 'MULTICHOICE_H', label: 'Multiple choice (horizontal radio)', aliases: ['MCH'] },
  { value: 'MULTIRESPONSE', label: 'Multiple response (vertical)', aliases: ['MR'] },
  { value: 'MULTIRESPONSE_H', label: 'Multiple response (horizontal)', aliases: ['MRH'] },
  { value: 'MULTICHOICE_S', label: 'Multiple choice drop-down (shuffled)', aliases: ['MCS'] },
  { value: 'MULTICHOICE_VS', label: 'Multiple choice vertical (shuffled)', aliases: ['MCVS'] },
  { value: 'MULTICHOICE_HS', label: 'Multiple choice horizontal (shuffled)', aliases: ['MCHS'] },
  { value: 'MULTIRESPONSE_S', label: 'Multiple response vertical (shuffled)', aliases: ['MRS'] },
  { value: 'MULTIRESPONSE_HS', label: 'Multiple response horizontal (shuffled)', aliases: ['MRHS'] },
];

const ALIAS = {};
for (const t of CLOZE_TYPES) {
  ALIAS[t.value] = t.value;
  for (const a of t.aliases) ALIAS[a] = t.value;
}

export const canonicalClozeType = (t) => ALIAS[t] || t;
export const isNumericalCloze = (t) => canonicalClozeType(t) === 'NUMERICAL';
export const isChoiceCloze = (t) => /^MULTI/.test(canonicalClozeType(t));

// Note: a gap can't contain an unescaped "}"; answers may contain escaped characters.
export const CLOZE_RE = /\{(\d*):([A-Za-z_]+):((?:\\.|[^}\\])*)\}/g;

function splitUnescaped(s, sep) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      cur += s[i] + s[i + 1];
      i++;
    } else if (s[i] === sep) {
      parts.push(cur);
      cur = '';
    } else cur += s[i];
  }
  parts.push(cur);
  return parts;
}

const unescape = (s) => s.replace(/\\([}#~/"\\])/g, '$1');
export const clozeEscape = (s) => String(s ?? '').replace(/([}#~/"\\])/g, '\\$1');

/** Parses the gaps in a Cloze question text. */
export function parseCloze(text) {
  const gaps = [];
  for (const m of String(text ?? '').matchAll(CLOZE_RE)) {
    const type = canonicalClozeType(m[2].toUpperCase());
    const answers = splitUnescaped(m[3], '~')
      .filter((a, i) => a !== '' || i > 0)
      .map((a) => {
        let fraction = 0;
        let rest = a;
        if (rest.startsWith('=')) {
          fraction = 100;
          rest = rest.slice(1);
        } else {
          const w = /^%(-?\d+(?:\.\d+)?)%/.exec(rest);
          if (w) {
            fraction = parseFloat(w[1]);
            rest = rest.slice(w[0].length);
          }
        }
        const [body, ...fb] = splitUnescaped(rest, '#');
        let answerText = unescape(body);
        let tolerance = 0;
        if (type === 'NUMERICAL' && answerText.includes(':')) {
          const [v, t] = answerText.split(':');
          answerText = v;
          tolerance = parseFloat(t) || 0;
        }
        return { id: uid(), text: answerText, fraction, feedback: unescape(fb.join('#')), tolerance };
      });
    gaps.push({ raw: m[0], index: m.index, weight: m[1] === '' ? 1 : parseInt(m[1], 10), type, answers });
  }
  return gaps;
}

/** Builds the Cloze syntax for a single gap. */
export function buildCloze(gap) {
  const parts = gap.answers
    .filter((a) => String(a.text).trim() !== '' || Number(a.fraction) !== 0)
    .map((a) => {
      const f = Number(a.fraction);
      const prefix = f === 100 ? '=' : f === 0 ? '' : `%${f}%`;
      const tol = isNumericalCloze(gap.type) && Number(a.tolerance) ? `:${Number(a.tolerance)}` : '';
      const fb = String(a.feedback ?? '').trim() ? `#${clozeEscape(a.feedback)}` : '';
      return `${prefix}${clozeEscape(a.text)}${tol}${fb}`;
    });
  return `{${gap.weight ?? 1}:${gap.type}:${parts.join('~')}}`;
}

/** "Embedded answers (Cloze)" import format: the whole text is a single question. */
export function importClozeText(src) {
  const text = src.trim();
  if (!text) return { quiz: {}, questions: [], warnings: ['The text is empty.'] };
  const html = /<\/?[a-z][^>]*>/i.test(text) ? text : escapeHtml(text).replace(/\n/g, '<br>');
  const warnings = parseCloze(text).length ? [] : ['No embedded {…} answers were found in the text.'];
  return {
    quiz: {},
    questions: [{ id: uid(), type: 'cloze', name: '', questiontext: html, questiontextformat: 'html' }],
    warnings,
  };
}
