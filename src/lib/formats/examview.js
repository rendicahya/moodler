// ExamView XML export, for File → Import → ExamView XML in ExamView Test Generator.
// There is no public specification. ExamView reports an unknown tag as an error in the file, so this only writes tags
// and question types known from files ExamView made, or from programs that read those: for anything else the nearest of those is used.

import { escapeHtml, decodeEntities, questionTitle, scramble, stripHtml } from '../model.js';
import { parseCloze, CLOZE_RE, isChoiceCloze, canonicalClozeType } from './cloze.js';
import { substitute, itemValues, tryEvaluate, formatAnswer } from '../calc.js';

const MAX_QUESTIONS = 250; // in one question bank or test
const MAX_CHOICES = 26;
const BLANK = '____________';
const NBSP = '\u00a0';

const letter = (i) => String.fromCharCode(65 + i);
const isFilled = (text) => stripHtml(text) !== '' || /<img/i.test(text || '');

/** Text for XML, in ASCII only so that it does not depend on how the file's encoding is read. */
function xmlText(s) {
  return s
    .replace(/[^\t\n\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    .replace(/[^\x00-\x7f]/gu, (c) => `&#x${c.codePointAt(0).toString(16)};`);
}

// decodeEntities knows the entities the editor writes; imported HTML can have any, which the browser knows.
function decode(s) {
  const text = decodeEntities(s);
  if (!/&[a-z]+\d*;/i.test(text) || typeof document === 'undefined') return text;
  const el = document.createElement('textarea');
  return text.replace(/&[a-z]+\d*;/gi, (e) => {
    el.innerHTML = e;
    return el.value;
  });
}

// ExamView has no known tag for underlined text, so it becomes italic to stay emphasized.
const FORMAT_TAGS = { b: 'b', strong: 'b', th: 'b', i: 'i', em: 'i', u: 'i', ins: 'i', sub: 'sub', sup: 'sup' };
const BLOCK_TAGS = /^(p|div|h[1-6]|ul|ol|li|table|tr|pre|blockquote|section|article|figure|figcaption|dl|dt|dd|hr|center)$/;

/**
 * Turns HTML into ExamView's text: bold, italic, subscript and superscript, with line breaks as they are. `lost` (a Set)
 * gets what could not be kept.
 */
export function examviewText(html, lost = new Set()) {
  const lines = [[]];
  const open = [];
  const lists = [];
  let pre = 0;
  let skip = 0;
  // A line break is due before the next text. Two are never due at once, so empty blocks leave no blank lines.
  let due = false;
  // Right after a list's bullet, where the item's own paragraph stays on the same line.
  let bullet = false;
  let cell = 0;

  const startLine = () => {
    if (due && lines.at(-1).length) lines.push([]);
    due = false;
  };
  const add = (text) => {
    if (!text) return;
    startLine();
    bullet = false;
    const tags = [...new Set(open)].sort();
    const line = lines.at(-1);
    const last = line.at(-1);
    if (last && last.tags.join() === tags.join()) last.text += text;
    else line.push({ text, tags });
  };
  const atStart = () => due || !lines.at(-1).length;
  const endsInSpace = () => /[ \t]$/.test(lines.at(-1).at(-1)?.text ?? '');

  for (const [, comment, close, tagName, attrs, text] of String(html ?? '').matchAll(/(<!--[\s\S]*?-->)|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g)) {
    if (comment) continue;
    if (text !== undefined) {
      if (skip) continue;
      if (pre) {
        const t = decode(text).replace(/\r\n?/g, '\n');
        // HTML leaves out a line break right at the start of <pre>.
        (due ? t.replace(/^\n/, '') : t).split('\n').forEach((part, i) => {
          if (i) {
            startLine();
            lines.push([]);
          }
          add(part.replace(/\t/g, '    ').replace(/^ +| {2,}/g, (m) => NBSP.repeat(m.length)));
        });
        continue;
      }
      // Spaces are joined before entities are decoded, which keeps a non-breaking space.
      const t = text.replace(/[ \t\r\n\f]+/g, ' ');
      add(decode(atStart() || endsInSpace() ? t.replace(/^ /, '') : t));
      continue;
    }
    const tag = tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') skip = Math.max(0, skip + (close ? -1 : 1));
    if (skip) continue;
    if (FORMAT_TAGS[tag]) {
      if (close) {
        const i = open.lastIndexOf(FORMAT_TAGS[tag]);
        if (i >= 0) open.splice(i, 1);
      } else if (!attrs.endsWith('/')) {
        open.push(FORMAT_TAGS[tag]);
      }
    }
    if (tag === 'br') {
      due = false;
      lines.push([]);
    } else if (tag === 'img') {
      lost.add('pictures');
      const alt = decode(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)?.slice(1).find((x) => x !== undefined) ?? '').trim();
      add(`[${alt || 'picture'}]`);
    } else if (tag === 'table' && !close) {
      lost.add('table lines');
    } else if (/^(audio|video|iframe|object|embed|svg)$/.test(tag) && !close) {
      lost.add('media');
    }
    if (tag === 'td' || tag === 'th') {
      if (!close && !atStart()) add(' | ');
      cell = Math.max(0, cell + (close ? -1 : 1));
    }
    // Paragraphs of a table cell stay on the line of their row, as a list item's do with its bullet.
    if (BLOCK_TAGS.test(tag) && !(/^(p|div)$/.test(tag) && (cell || (bullet && !close)))) due = true;
    if (tag === 'tr' || tag === 'table') cell = 0;
    if (tag === 'pre') pre = Math.max(0, pre + (close ? -1 : 1));
    if (tag === 'ul' || tag === 'ol') {
      if (close) lists.pop();
      else lists.push(tag === 'ol' ? 1 : 0);
    } else if (tag === 'li' && !close && lists.length) {
      const n = lists.at(-1);
      add(`${NBSP.repeat((lists.length - 1) * 4)}${n ? `${n}.` : '•'} `);
      if (n) lists[lists.length - 1]++;
      bullet = true;
    }
  }

  const out = lines.map((line) => {
    if (line.length) line.at(-1).text = line.at(-1).text.replace(/[ \t]+$/, '');
    return line.map(({ text, tags }) => (text ? tags.map((t) => `<${t}>`).join('') + xmlText(text) + [...tags].reverse().map((t) => `</${t}>`).join('') : '')).join('');
  });
  while (out.length && !out[0]) out.shift();
  while (out.length && !out.at(-1)) out.pop();
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Answers worth full marks, or the best ones when there are none; notes when others are left out. */
function accepted(answers, lost) {
  const right = answers.filter((a) => Number(a.fraction) > 0 && String(a.text).trim() !== '');
  const top = Math.max(...right.map((a) => Number(a.fraction)));
  const best = right.filter((a) => Number(a.fraction) === top);
  if (best.length < right.length || top < 100) lost.add('partial credit');
  return best;
}

export function exportExamview(quiz, questions = quiz.questions, { type = 'test' } = {}) {
  const warnings = [];
  const out = [];
  let count = 0;
  let groups = 0;

  const el = (name, content) => `        <${name}>${content}</${name}>`;

  function write(code, parts, attrs = '') {
    count++;
    out.push(`    <question type='${code}' question-id='${count}' bank-id='0'${attrs}>`, ...parts.filter(Boolean), '    </question>');
  }
  const choiceRows = (texts) => ["        <choices columns='1'>", ...texts.map((t, i) => `            <choice-${letter(i).toLowerCase()}>${t}</choice-${letter(i).toLowerCase()}>`), '        </choices>'];
  const space = ['        <info>', '            <answer-space>-1</answer-space>', '        </info>'].join('\n');

  for (const q of questions) {
    const title = questionTitle(q);
    const skip = (why) => warnings.push(`"${title}" was skipped: ${why}`);
    const lost = new Set();
    const htmlOf = (text) => (q.questiontextformat && q.questiontextformat !== 'html' ? escapeHtml(text).replace(/\n/g, '<br>') : text);
    const rich = (html) => examviewText(html, lost);
    // Answers that Moodle stores as plain text.
    const plain = (s) => xmlText(String(s ?? '').trim());
    const text = (html = q.questiontext) => el('text', rich(htmlOf(html)));
    const rationale = isFilled(q.generalfeedback) ? el('rationale', rich(q.generalfeedback)) : '';
    const answer = (content) => el('answer', content);
    const list = (texts) => texts.map((t, i) => `${letter(i)}. ${t}`).join('\n');

    switch (q.type) {
      case 'multichoice': {
        const rows = q.answers.filter((a) => isFilled(a.text));
        if (rows.length < 2 || !rows.some((a) => Number(a.fraction) > 0)) {
          skip('it needs at least two answers, one of them correct.');
          continue;
        }
        if (rows.length > MAX_CHOICES) {
          skip(`ExamView allows up to ${MAX_CHOICES} choices.`);
          continue;
        }
        const texts = rows.map((a) => rich(a.text));
        const right = rows.filter((a) => Number(a.fraction) > 0);
        if (rows.some((a) => isFilled(a.feedback))) lost.add('feedback of the answers');
        if (q.single || right.length === 1) {
          const [best] = [...right].sort((a, b) => b.fraction - a.fraction);
          if (rows.some((a) => a !== best && Number(a.fraction) !== 0)) lost.add('partial credit');
          write('mc', [text(), ...choiceRows(texts), rationale, answer(letter(rows.indexOf(best)))]);
        } else {
          warnings.push(`"${title}" has several correct answers, so it became a short answer question with the choices in its text.`);
          const stem = rich(htmlOf(q.questiontext));
          write('sa', [el('text', `${stem}\n\n${list(texts)}`), rationale, answer(right.map((a) => letter(rows.indexOf(a))).join(', ')), space]);
        }
        break;
      }
      case 'truefalse':
        if (isFilled(q.feedbacktrue) || isFilled(q.feedbackfalse)) lost.add('feedback of the answers');
        write('tf', [text(), rationale, answer(q.correct ? 'T' : 'F')]);
        break;
      case 'shortanswer': {
        const rows = accepted(q.answers, lost).filter((a) => a.text.trim() !== '*');
        if (rows.some((a) => /(^|[^\\])\*/.test(a.text))) lost.add('the meaning of * in answers');
        // ExamView scores completion questions by itself, but those need a blank to write on.
        write(/_{3,}/.test(stripHtml(q.questiontext)) ? 'co' : 'sa', [text(), rationale, answer(rows.map((a) => plain(a.text.replace(/\\\*/g, '*'))).join('\n')), space]);
        break;
      }
      case 'numerical':
      case 'calculated': {
        let rows = accepted(q.answers, lost);
        let body = q.questiontext;
        if (q.type === 'calculated') {
          warnings.push(`"${title}" has random values; only the first set was written.`);
          const values = itemValues(q, 0);
          body = substitute(body, q, 0);
          rows = rows.map((a) => {
            const r = tryEvaluate(a.text, values);
            return { ...a, text: r.error ? '' : formatAnswer(r.value, a.correctanswerformat, a.correctanswerlength) };
          });
        }
        if (rows.some((a) => Number(a.tolerance))) lost.add('tolerance');
        if (q.units?.length) lost.add('units');
        write('nr', [text(body), rationale, answer(rows.map((a) => plain(a.text)).filter((t) => t && t !== '*').join('\n')), space]);
        break;
      }
      case 'essay':
        write('es', [text(), rationale, answer(rich(q.graderinfo)), space]);
        break;
      case 'matching': {
        const subs = q.subquestions.filter((s) => isFilled(s.text) && String(s.answer).trim());
        // Sorted, so that the order gives nothing away.
        const options = [...new Set(q.subquestions.map((s) => String(s.answer ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        if (!subs.length) {
          skip('it has nothing to match.');
          continue;
        }
        if (options.length > MAX_CHOICES || subs.length > MAX_CHOICES) {
          skip(`ExamView allows up to ${MAX_CHOICES} items and choices to match.`);
          continue;
        }
        const name = `Matching ${++groups}`;
        out.push(`    <matching-group group-id='${groups}' bank-id='0' name='${name}'>`, text(), ...choiceRows(options.map(plain)), '    </matching-group>');
        if (rationale) lost.add('general feedback');
        for (const s of subs) write('ma', [el('text', rich(s.text)), answer(letter(options.indexOf(s.answer.trim())))], ` group='${name}'`);
        break;
      }
      case 'cloze': {
        const gaps = parseCloze(q.questiontext);
        let n = 0;
        const body = String(q.questiontext ?? '').replace(CLOZE_RE, () => {
          const g = gaps[n++];
          const options = isChoiceCloze(g.type) ? ` [${g.answers.map((a) => escapeHtml(stripHtml(a.text))).join(' / ')}]` : '';
          return `${gaps.length > 1 ? `(${n}) ` : ''}${BLANK}${options}`;
        });
        const keys = gaps.map((g) => {
          const multi = canonicalClozeType(g.type).startsWith('MULTIRESPONSE');
          const rows = multi ? g.answers.filter((a) => a.fraction > 0) : accepted(g.answers, lost).filter((a) => a.text.trim() !== '*');
          if (rows.some((a) => Number(a.tolerance))) lost.add('tolerance');
          return rows.map((a) => plain(stripHtml(a.text)));
        });
        // One answer per line means that any of them is right, so with several blanks each line is one blank instead.
        const key = gaps.length === 1 ? keys[0].join('\n') : keys.map((k, i) => `(${i + 1}) ${k.join(' / ')}`).join('\n');
        write('co', [text(body), rationale, answer(key), space]);
        break;
      }
      case 'gapselect':
      case 'ddwtos': {
        const refs = [...String(q.questiontext ?? '').matchAll(/\[\[(\d+)\]\]/g)].map((m) => q.choices[Number(m[1]) - 1]);
        let n = 0;
        const body = String(q.questiontext ?? '').replace(/\[\[\d+\]\]/g, () => `${refs.length > 1 ? `(${++n}) ` : ''}${BLANK}`);
        const words = [...new Set(q.choices.map((c) => c.group))]
          .sort((a, b) => a - b)
          .map((g) => `[${q.choices.filter((c) => c.group === g && c.text.trim()).map((c) => plain(stripHtml(c.text))).join(' / ')}]`);
        const key = refs.map((c, i) => `${refs.length > 1 ? `(${i + 1}) ` : ''}${plain(stripHtml(c?.text))}`).join('\n');
        write('co', [el('text', `${rich(htmlOf(body))}\n\n${words.join('\n')}`), rationale, answer(key), space]);
        break;
      }
      case 'ordering': {
        const items = q.items.filter((it) => isFilled(it.text));
        if (items.length < 2 || items.length > MAX_CHOICES) {
          skip(`it needs 2 to ${MAX_CHOICES} items to put in order.`);
          continue;
        }
        const mixed = scramble(items);
        const stem = rich(htmlOf(q.questiontext));
        write('sa', [el('text', `${stem}\n\n${list(mixed.map((it) => rich(it.text)))}`), rationale, answer(items.map((it) => letter(mixed.indexOf(it))).join(', ')), space]);
        break;
      }
      default:
        skip('ExamView XML has no questions without an answer.');
        continue;
    }
    if (lost.size) warnings.push(`"${title}": left out ${[...lost].join(', ')}.`);
  }

  if (questions.some((q) => q.type !== 'cloze' && q.type !== 'description' && Number(q.defaultgrade) !== 1)) warnings.push('Marks are not written to the file, so set the points in ExamView.');
  if (count > MAX_QUESTIONS) warnings.push(`The file has ${count} questions, but ExamView allows up to ${MAX_QUESTIONS}. Export them in parts with "Selected".`);

  if (!count) return { text: '', warnings };
  const root = `<examview type='${type === 'bank' ? 'bank' : 'test'}' platform='Windows' app-version='4.0.2'>`;
  return { text: ["<?xml version='1.0' encoding='utf-8' standalone='yes'?>", root, ...out, '</examview>', ''].join('\n'), warnings };
}
