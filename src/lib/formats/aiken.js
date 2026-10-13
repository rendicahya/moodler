// Aiken import/export. Reference: https://docs.moodle.org/en/Aiken_format
// Aiken only supports single-answer multiple choice questions with plain-text content.

import { uid, escapeHtml, stripHtml } from '../model.js';

const OPTION_RE = /^\s*([A-Za-z])\s*[.)]\s+(.*)$/;
const ANSWER_RE = /^\s*ANSWER\s*:\s*([A-Za-z])\s*$/i;

export function importAiken(src) {
  const warnings = [];
  const questions = [];
  const lines = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

  let text = [];
  let options = [];
  let lineNo = 0;

  const reset = () => {
    text = [];
    options = [];
  };

  for (const line of lines) {
    lineNo++;
    if (!line.trim()) {
      if (!options.length && text.length) text.push('');
      continue;
    }
    const ans = ANSWER_RE.exec(line);
    if (ans) {
      if (!text.length || options.length < 2) {
        warnings.push(`Line ${lineNo}: "ANSWER:" found without a question and at least two options; skipped.`);
        reset();
        continue;
      }
      const letter = ans[1].toUpperCase();
      const idx = options.findIndex((o) => o.letter === letter);
      if (idx === -1) warnings.push(`Line ${lineNo}: answer "${letter}" does not match any option.`);
      questions.push({
        id: uid(),
        type: 'multichoice',
        name: '',
        questiontext: escapeHtml(text.join('\n').trim()).replace(/\n/g, '<br>'),
        questiontextformat: 'html',
        single: true,
        shuffleanswers: true,
        answernumbering: 'ABCD',
        answers: options.map((o, i) => ({ id: uid(), text: escapeHtml(o.text), fraction: i === idx ? 100 : 0, feedback: '' })),
      });
      reset();
      continue;
    }
    const opt = OPTION_RE.exec(line);
    if (opt && text.length) {
      options.push({ letter: opt[1].toUpperCase(), text: opt[2].trim() });
    } else if (options.length) {
      // Continuation of the previous option text.
      options[options.length - 1].text += ' ' + line.trim();
    } else {
      text.push(line.trim());
    }
  }
  if (text.length && text.some((t) => t)) warnings.push('The last question has no "ANSWER:" line and was skipped.');
  if (!questions.length && !warnings.length) warnings.push('No Aiken questions were found.');
  return { quiz: {}, questions, warnings };
}

export function exportAiken(quiz, questions = quiz.questions) {
  const warnings = [];
  const out = [];
  const oneLine = (html) => stripHtml(html).replace(/\s*\n\s*/g, ' ').trim();

  for (const q of questions) {
    const label = q.name || oneLine(q.questiontext).slice(0, 40) || 'Untitled';
    if (q.type !== 'multichoice') {
      warnings.push(`"${label}" was skipped: Aiken only supports multiple choice questions.`);
      continue;
    }
    const answers = q.answers.filter((a) => oneLine(a.text));
    const correct = answers.filter((a) => Number(a.fraction) === 100);
    if (!q.single || correct.length !== 1) {
      warnings.push(`"${label}" was skipped: Aiken requires exactly one correct answer.`);
      continue;
    }
    if (answers.length > 26) {
      warnings.push(`"${label}" was skipped: too many answers.`);
      continue;
    }
    if (answers.some((a) => Number(a.fraction) !== 100 && Number(a.fraction) !== 0)) {
      warnings.push(`"${label}": partial credit cannot be represented in Aiken and was dropped.`);
    }
    if (/<img/i.test(q.questiontext) || answers.some((a) => /<img/i.test(a.text))) {
      warnings.push(`"${label}": images cannot be represented in Aiken and were dropped.`);
    }
    out.push(oneLine(q.questiontext));
    answers.forEach((a, i) => out.push(`${String.fromCharCode(65 + i)}. ${oneLine(a.text)}`));
    out.push(`ANSWER: ${String.fromCharCode(65 + answers.indexOf(correct[0]))}`, '');
  }
  return { text: out.join('\n'), warnings };
}
