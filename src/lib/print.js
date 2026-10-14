// Printable (paper) version of a quiz: answer circles and boxes instead of form controls, blank lines to write on,
// and optionally the correct answers marked in place or listed in an answer key at the end.

import { escapeHtml, round, stripHtml } from './model.js';
import { parseCloze, CLOZE_RE, isChoiceCloze, canonicalClozeType } from './formats/cloze.js';
import { sanitizeHtml } from './sanitize.js';

const html = (text, format = 'html') => (format === 'html' ? sanitizeHtml(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>'));
const plain = (text) => escapeHtml(stripHtml(text));
const letter = (i) => String.fromCharCode(65 + i);

function label(i, style) {
  switch (style) {
    case 'ABCD':
      return letter(i) + '.';
    case '123':
      return i + 1 + '.';
    case 'iii':
      return ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i] + '.';
    case 'IIII':
      return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] + '.';
    case 'none':
      return '';
    default:
      return String.fromCharCode(97 + i) + '.';
  }
}

export const markOf = (q) => (q.type === 'cloze' ? parseCloze(q.questiontext).reduce((s, g) => s + g.weight, 0) : Number(q.defaultgrade) || 0);
const best = (answers) => answers.reduce((b, a) => (Number(a.fraction) > Number(b?.fraction ?? -Infinity) ? a : b), null);
const blank = (show, text, width = 10) => (show ? `<span class="fill">${text}</span>` : `<span class="blank" style="min-width:${width}em"></span>`);

// Ordering items are printed in a fixed scrambled order (reversed, then every other item), never the answer order.
function scramble(items) {
  const r = [...items].reverse();
  return [...r.filter((_, i) => i % 2 === 0), ...r.filter((_, i) => i % 2 === 1)];
}

function cloze(q, show) {
  let n = 0;
  return html(q.questiontext).replace(CLOZE_RE, (raw) => {
    const g = parseCloze(raw)[0];
    if (!g) return raw;
    n++;
    const type = canonicalClozeType(g.type);
    if (isChoiceCloze(type)) {
      const multi = type.startsWith('MULTIRESPONSE');
      const top = best(g.answers);
      const opts = g.answers.map((a) => {
        const right = multi ? a.fraction > 0 : a === top;
        return `<span class="${show && right ? 'right' : ''}">${show && right ? '✓ ' : ''}${plain(a.text)}</span>`;
      });
      return `<span class="gapno">(${n})</span> <span class="opts">[ ${opts.join(' / ')} ]</span>`;
    }
    const b = best(g.answers);
    const width = Math.max(6, ...g.answers.map((a) => String(a.text).length)) * 0.7 + 2;
    return `<span class="gapno">(${n})</span> ${blank(show && b, plain(b?.text ?? ''), width)}`;
  });
}

function gaps(q, show) {
  return html(q.questiontext).replace(/\[\[(\d+)\]\]/g, (m, num) => {
    const c = q.choices[Number(num) - 1];
    const width = Math.max(5, ...q.choices.map((x) => x.text.length)) * 0.7 + 2;
    return `<span class="gapno">(${num})</span> ${blank(show && c, escapeHtml(c?.text ?? ''), width)}`;
  });
}

function body(q, show) {
  switch (q.type) {
    case 'multichoice': {
      const shape = q.single ? 'circle' : 'square';
      const rows = q.answers
        .filter((a) => stripHtml(a.text) || /<img/i.test(a.text))
        .map((a, i) => {
          const right = show && a.fraction > 0;
          const part = right && a.fraction < 100 ? ` <span class="pct">(${round(a.fraction, 2)}%)</span>` : '';
          return `<li class="${right ? 'right' : ''}"><span class="box ${shape}${right ? ' on' : ''}"></span><span class="lbl">${label(i, q.answernumbering)}</span><div class="opt">${html(a.text)}${part}</div></li>`;
        })
        .join('');
      return `<p class="prompt">${q.single ? 'Select one:' : 'Select one or more:'}</p><ul class="choices">${rows}</ul>`;
    }
    case 'truefalse':
      return `<ul class="choices tf">${[true, false]
        .map((v) => {
          const right = show && q.correct === v;
          return `<li class="${right ? 'right' : ''}"><span class="box circle${right ? ' on' : ''}"></span><div class="opt">${v ? 'True' : 'False'}</div></li>`;
        })
        .join('')}</ul>`;
    case 'shortanswer':
    case 'numerical': {
      const accepted = q.answers.filter((a) => a.fraction > 0 && String(a.text).trim() !== '');
      const text = accepted
        .map((a) => `${escapeHtml(a.text)}${a.tolerance ? ` ± ${escapeHtml(a.tolerance)}` : ''}${a.fraction < 100 ? ` (${round(a.fraction, 2)}%)` : ''}`)
        .join('; ');
      const unit = q.type === 'numerical' && q.units?.length && q.showunits !== 3 ? ` <span class="muted">Unit: ${q.units.map((u) => escapeHtml(u.unit)).join(' / ')}</span>` : '';
      return `<p class="answer-line">Answer: ${blank(show && accepted.length, text, 16)}${unit}</p>`;
    }
    case 'essay': {
      if (show && q.graderinfo && stripHtml(q.graderinfo)) return `<div class="key-note"><strong>Information for graders</strong>${html(q.graderinfo)}</div>`;
      if (q.responseformat === 'noinline') return '';
      const lines = Math.min(24, Math.max(4, Number(q.responsefieldlines) || 10));
      return `<div class="lines">${'<div class="line"></div>'.repeat(lines)}</div>`;
    }
    case 'matching': {
      const subs = q.subquestions.filter((s) => stripHtml(s.text) || /<img/i.test(s.text));
      const options = [...new Set(q.subquestions.map((s) => s.answer).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const rows = subs
        .map((s, i) => {
          const k = options.indexOf(s.answer);
          return `<tr><td class="n">${i + 1}.</td><td>${html(s.text)}</td><td class="pick">${blank(show && k >= 0, `${letter(k)}. ${escapeHtml(s.answer)}`, 3)}</td></tr>`;
        })
        .join('');
      const opts = options.map((a, i) => `<li><strong>${letter(i)}.</strong> ${escapeHtml(a)}</li>`).join('');
      return `<p class="prompt">Match each item with a letter from the list.</p><div class="match"><table>${rows}</table><ol class="bank-list">${opts}</ol></div>`;
    }
    case 'gapselect':
    case 'ddwtos': {
      const groups = [...new Set(q.choices.map((c) => c.group))].sort((a, b) => a - b);
      const bank = groups
        .map((g) => `<div class="bank">${q.choices.filter((c) => c.group === g).map((c) => `<span class="word">${escapeHtml(c.text)}</span>`).join('')}</div>`)
        .join('');
      return `<p class="prompt">Fill each gap with a word from the list${groups.length > 1 ? 's' : ''}.</p>${bank}`;
    }
    case 'ordering': {
      const items = q.items.filter((it) => stripHtml(it.text) || /<img/i.test(it.text));
      const rows = scramble(items)
        .map((it) => `<li><span class="order-box">${show ? items.indexOf(it) + 1 : ''}</span><div class="opt">${html(it.text)}</div></li>`)
        .join('');
      return `<p class="prompt">Number the items in the correct order.</p><ul class="choices order">${rows}</ul>`;
    }
    default:
      return '';
  }
}

/** One-line summary of the correct answer, for the answer key. */
function keyText(q) {
  switch (q.type) {
    case 'multichoice': {
      const shown = q.answers.filter((a) => stripHtml(a.text) || /<img/i.test(a.text));
      return shown
        .map((a, i) => (a.fraction > 0 ? `${label(i, q.answernumbering === 'none' ? 'abc' : q.answernumbering).replace('.', '')}${a.fraction < 100 ? ` (${round(a.fraction, 2)}%)` : ''}` : null))
        .filter(Boolean)
        .join(', ');
    }
    case 'truefalse':
      return q.correct ? 'True' : 'False';
    case 'shortanswer':
    case 'numerical':
      return q.answers
        .filter((a) => a.fraction > 0)
        .map((a) => `${escapeHtml(a.text)}${a.tolerance ? ` ± ${escapeHtml(a.tolerance)}` : ''}${a.fraction < 100 ? ` (${round(a.fraction, 2)}%)` : ''}`)
        .join('; ');
    case 'essay':
      return stripHtml(q.graderinfo) ? plain(q.graderinfo) : '<span class="muted">Graded manually</span>';
    case 'matching': {
      const options = [...new Set(q.subquestions.map((s) => s.answer).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return q.subquestions
        .filter((s) => stripHtml(s.text) || /<img/i.test(s.text))
        .map((s, i) => `${i + 1}–${letter(options.indexOf(s.answer))}`)
        .join(', ');
    }
    case 'cloze':
      return parseCloze(q.questiontext)
        .map((g, i) => {
          const multi = canonicalClozeType(g.type).startsWith('MULTIRESPONSE');
          const right = multi ? g.answers.filter((a) => a.fraction > 0) : [best(g.answers)].filter(Boolean);
          return `(${i + 1}) ${right.map((a) => plain(a.text)).join(' + ')}`;
        })
        .join('; ');
    case 'gapselect':
    case 'ddwtos':
      return [...(q.questiontext || '').matchAll(/\[\[(\d+)\]\]/g)].map((m) => `(${m[1]}) ${escapeHtml(q.choices[Number(m[1]) - 1]?.text ?? '?')}`).join('; ');
    case 'ordering':
      return q.items
        .filter((it) => stripHtml(it.text) || /<img/i.test(it.text))
        .map((it) => plain(it.text))
        .join(' → ');
    default:
      return '';
  }
}

/**
 * Builds a standalone HTML document for printing.
 * options: { answers: 'none' | 'inline' | 'key', marks: boolean, studentFields: boolean, feedback: boolean }
 */
export function buildPrintHtml(quiz, questions, { answers = 'none', marks = true, studentFields = true, feedback = false } = {}) {
  const show = answers === 'inline';
  let n = 0;
  const numbered = questions.map((q) => ({ q, number: q.type === 'description' ? 0 : ++n }));
  const total = round(questions.reduce((s, q) => s + (q.type === 'description' ? 0 : markOf(q)), 0), 2);
  const markText = (m) => `${round(m, 2)} mark${round(m, 2) === 1 ? '' : 's'}`;

  const items = numbered
    .map(({ q, number }) => {
      const text = q.type === 'cloze' ? cloze(q, show) : q.type === 'gapselect' || q.type === 'ddwtos' ? gaps(q, show) : html(q.questiontext, q.questiontextformat);
      const fb = show && feedback && stripHtml(q.generalfeedback) ? `<div class="feedback">${html(q.generalfeedback)}</div>` : '';
      if (!number) return `<section class="q info">${text}</section>`;
      return `<section class="q"><div class="qhead"><span class="qno">${number}.</span>${marks ? `<span class="qmark">${markText(markOf(q))}</span>` : ''}</div><div class="qbody"><div class="qtext">${text}</div>${body(q, show)}${fb}</div></section>`;
    })
    .join('');

  const key =
    answers === 'key'
      ? `<section class="answer-key"><h2>Answer key</h2><ol>${numbered
          .filter((x) => x.number)
          .map(({ q, number }) => `<li value="${number}">${keyText(q) || '—'}${feedback && stripHtml(q.generalfeedback) ? `<div class="muted">${plain(q.generalfeedback)}</div>` : ''}</li>`)
          .join('')}</ol></section>`
      : '';

  const title = escapeHtml(quiz.name || 'Quiz');
  const intro = stripHtml(quiz.info) ? `<div class="intro">${html(quiz.info)}</div>` : '';
  const fields = studentFields ? `<div class="student"><span class="name">Name: <span class="blank"></span></span><span>ID: <span class="blank"></span></span><span>Date: <span class="blank"></span></span></div>` : '';
  const meta = `${n} question${n === 1 ? '' : 's'}${marks ? ` · ${markText(total)}` : ''}${answers === 'inline' ? ' · with answers' : ''}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>
<header class="top"><h1>${title}</h1><p class="meta">${meta}</p>${fields}</header>${intro}<main>${items}</main>${key}</body></html>`;
}

const CSS = `
@page { margin: 16mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 11pt/1.5 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; }
p { margin: 0 0 .4em; }
h1 { font-size: 17pt; margin: 0; }
h2 { font-size: 13pt; margin: 0 0 .6em; }
.top { border-bottom: 1.5pt solid #000; padding-bottom: 8pt; margin-bottom: 12pt; }
.meta, .muted { color: #555; font-size: 9.5pt; }
.student { display: flex; flex-wrap: wrap; gap: 6pt 22pt; margin-top: 10pt; }
.student > span { flex: 1 1 9em; display: flex; align-items: baseline; gap: 4pt; white-space: nowrap; }
.student > .name { flex-grow: 2.4; }
.student .blank { flex: 1; }
.intro { margin-bottom: 12pt; }
.q { display: flex; gap: 8pt; padding: 8pt 0; break-inside: avoid; }
.q + .q { border-top: .5pt solid #ccc; }
.q.info { display: block; }
.qhead { flex: none; width: 52pt; display: flex; flex-direction: column; }
.qno { font-weight: 700; font-size: 12pt; }
.qmark { font-size: 8.5pt; color: #555; }
.qbody { flex: 1; min-width: 0; }
.qtext > :last-child { margin-bottom: 0; }
.prompt { font-size: 9.5pt; color: #444; margin: 5pt 0 3pt; }
.choices { list-style: none; margin: 4pt 0 0; padding: 0; }
.choices li { display: flex; gap: 6pt; align-items: baseline; padding: 1.5pt 0; }
.choices.tf { display: flex; gap: 28pt; }
.choices.order li { align-items: center; }
.box { flex: none; position: relative; top: 1.5pt; width: 9pt; height: 9pt; border: .9pt solid #000; }
.box.circle { border-radius: 50%; }
.box.square { border-radius: 1.5pt; }
.box.on { border-color: #0a6b2f; background: #0a6b2f; box-shadow: inset 0 0 0 1.6pt #fff; }
.lbl { flex: none; min-width: 14pt; }
.opt > p { margin: 0; }
.right { font-weight: 600; }
.right .box, .fill, .order-box, .right .pct { color: #0a6b2f; }
.pct { font-weight: 400; font-size: 9pt; }
.blank { display: inline-block; border-bottom: .8pt solid #000; height: 1.1em; vertical-align: baseline; }
.fill { display: inline-block; border-bottom: .8pt solid #0a6b2f; padding: 0 4pt; font-weight: 600; }
.gapno { font-size: 8pt; color: #555; vertical-align: super; }
.opts { white-space: normal; }
.answer-line { margin-top: 8pt; }
.lines { margin-top: 6pt; }
.line { height: 22pt; border-bottom: .5pt solid #999; }
.match { display: flex; flex-wrap: wrap; gap: 6pt 30pt; align-items: flex-start; margin-top: 4pt; }
.match td { padding: 3pt 8pt 3pt 0; vertical-align: baseline; }
.match td.n { width: 18pt; }
.match td.pick { white-space: nowrap; }
.bank-list { list-style: none; margin: 0; padding: 6pt 10pt; border: .5pt solid #999; border-radius: 4pt; }
.bank { display: flex; flex-wrap: wrap; gap: 4pt 6pt; padding: 6pt 8pt; margin-top: 4pt; border: .5pt solid #999; border-radius: 4pt; }
.word { padding: 0 6pt; border: .5pt solid #666; border-radius: 3pt; }
.order-box { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 18pt; height: 16pt; border: .8pt solid #000; border-radius: 2pt; font-weight: 600; }
.feedback, .key-note { margin-top: 6pt; padding: 5pt 8pt; border-left: 2pt solid #999; background: #f4f4f4; font-size: 10pt; }
.key-note strong { display: block; font-size: 9pt; }
.answer-key { break-before: page; }
.answer-key ol { margin: 0; padding-left: 22pt; }
.answer-key li { padding: 2pt 0; break-inside: avoid; }
@media screen {
  body { max-width: 760px; margin: 0 auto; padding: 28px 32px; }
  .answer-key { margin-top: 28px; padding-top: 16px; border-top: 1.5pt dashed #999; }
}
`;

/** Prints a document through a hidden frame, so the app itself is never part of the printout. */
export function printHtml(doc) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  w.document.open();
  w.document.write(doc);
  w.document.close();
  const go = () => {
    w.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 0));
    w.focus();
    w.print();
  };
  // Wait for images, or they may be missing from the printout.
  const pending = [...w.document.images].filter((img) => !img.complete);
  if (!pending.length) return setTimeout(go, 50);
  let left = pending.length;
  const done = () => --left === 0 && go();
  for (const img of pending) {
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  }
}
