// Moodle XML import/export. Reference: https://docs.moodle.org/en/Moodle_XML_format

import { parseXml, child, childrenNamed, innerText } from './xmlparser.js';
import { uid, round, DEFAULT_COMBINED_FEEDBACK } from '../model.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };
const EXT = Object.fromEntries(Object.entries(MIME).map(([e, m]) => [m, e]));

// ---------------------------------------------------------------- import

export function importMoodleXml(src) {
  const warnings = [];
  // AI chatbots often wrap the XML in a ```xml block or add a sentence around it: keep only the quiz itself.
  const quizOnly = src.match(/(?:<\?xml[^>]*\?>\s*)?<quiz[\s>][\s\S]*<\/quiz>/);
  const doc = parseXml((quizOnly ? quizOnly[0] : src).replace(/^﻿/, ''));
  const quizEl = child(doc, 'quiz');
  if (!quizEl) throw new Error('Not a Moodle XML file: missing <quiz> root element.');

  let currentCategory = '';
  let firstCategory = '';
  let categoryInfo = '';
  const questions = [];

  for (const el of childrenNamed(quizEl, 'question')) {
    const type = el.attrs.type;
    if (type === 'category') {
      currentCategory = innerText(child(child(el, 'category'), 'text')).trim();
      if (!firstCategory) {
        firstCategory = currentCategory;
        categoryInfo = readText(el, 'info');
      }
      continue;
    }
    try {
      const q = readQuestion(el, type, warnings);
      if (!q) continue;
      if (currentCategory && currentCategory !== firstCategory) q.category = currentCategory;
      questions.push(q);
    } catch (e) {
      warnings.push(`Skipped a "${type}" question: ${e.message}`);
    }
  }

  const quiz = {};
  if (firstCategory) {
    quiz.category = firstCategory;
    quiz.name = firstCategory.split('/').pop() || 'Imported quiz';
    quiz.info = categoryInfo;
  }
  return { quiz, questions, warnings };
}

function readText(el, name, withFormat = false) {
  const node = name ? child(el, name) : el;
  if (!node) return withFormat ? { text: '', format: 'html' } : '';
  let text = innerText(child(node, 'text'));
  // Embedded files referenced as @@PLUGINFILE@@/name become data URIs so they show in the editor.
  for (const f of childrenNamed(node, 'file')) {
    const fname = f.attrs.name;
    if (!fname) continue;
    const ext = fname.split('.').pop().toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const data = `data:${mime};base64,${innerText(f).replace(/\s+/g, '')}`;
    const escaped = fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const encoded = encodeURIComponent(fname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`@@PLUGINFILE@@/(?:${escaped}|${encoded})`, 'g'), data);
  }
  if (withFormat) return { text, format: node.attrs.format || 'html' };
  return text;
}

const val = (el, name, def = '') => {
  const n = child(el, name);
  return n ? innerText(n).trim() : def;
};
const num = (el, name, def) => {
  const v = parseFloat(val(el, name, ''));
  return Number.isFinite(v) ? v : def;
};
const bool = (el, name, def) => {
  const n = child(el, name);
  if (!n) return def;
  const v = innerText(n).trim().toLowerCase();
  if (v === '') return true; // e.g. <shownumcorrect/>
  return v === '1' || v === 'true' || v === 'yes';
};

function readAnswers(el, fn) {
  return childrenNamed(el, 'answer').map((a) => ({
    id: uid(),
    text: readText(a),
    fraction: parseFloat(a.attrs.fraction) || 0,
    feedback: readText(a, 'feedback'),
    ...(fn ? fn(a) : {}),
  }));
}

function readCombined(el) {
  return {
    correctfeedback: readText(el, 'correctfeedback'),
    partiallycorrectfeedback: readText(el, 'partiallycorrectfeedback'),
    incorrectfeedback: readText(el, 'incorrectfeedback'),
    shownumcorrect: !!child(el, 'shownumcorrect'),
  };
}

function readQuestion(el, type, warnings) {
  const qt = readText(el, 'questiontext', true);
  const base = {
    id: uid(),
    type,
    name: innerText(child(child(el, 'name'), 'text')).trim(),
    questiontext: qt.text,
    questiontextformat: qt.format,
    generalfeedback: readText(el, 'generalfeedback'),
    defaultgrade: num(el, 'defaultgrade', 1),
    penalty: num(el, 'penalty', 0.3333333),
    hidden: bool(el, 'hidden', false),
    idnumber: val(el, 'idnumber'),
    category: '',
    tags: childrenNamed(child(el, 'tags'), 'tag').map((t) => innerText(child(t, 'text')).trim()).filter(Boolean),
    hints: childrenNamed(el, 'hint').map((h) => ({ id: uid(), text: readText(h) })),
  };

  switch (type) {
    case 'multichoice':
      return {
        ...base,
        ...readCombined(el),
        single: bool(el, 'single', true),
        shuffleanswers: bool(el, 'shuffleanswers', true),
        answernumbering: val(el, 'answernumbering', 'abc') || 'abc',
        showstandardinstruction: bool(el, 'showstandardinstruction', false),
        answers: readAnswers(el),
      };
    case 'truefalse': {
      const q = { ...base, correct: true, feedbacktrue: '', feedbackfalse: '' };
      for (const a of childrenNamed(el, 'answer')) {
        const t = innerText(child(a, 'text')).trim().toLowerCase();
        const isTrue = t !== 'false';
        const fb = readText(a, 'feedback');
        const frac = parseFloat(a.attrs.fraction) || 0;
        if (isTrue) {
          q.feedbacktrue = fb;
          if (frac > 0) q.correct = true;
        } else {
          q.feedbackfalse = fb;
          if (frac > 0) q.correct = false;
        }
      }
      return q;
    }
    case 'shortanswer':
      return { ...base, usecase: bool(el, 'usecase', false), answers: readAnswers(el) };
    case 'numerical': {
      const unitsEl = child(el, 'units');
      return {
        ...base,
        answers: readAnswers(el, (a) => ({ tolerance: num(a, 'tolerance', 0) })),
        units: childrenNamed(unitsEl, 'unit').map((u) => ({ id: uid(), unit: val(u, 'unit_name'), multiplier: num(u, 'multiplier', 1) })),
        unitgradingtype: num(el, 'unitgradingtype', 0),
        unitpenalty: num(el, 'unitpenalty', 0.1),
        showunits: num(el, 'showunits', 3),
        unitsleft: bool(el, 'unitsleft', false),
      };
    }
    case 'essay':
      return {
        ...base,
        responseformat: val(el, 'responseformat', 'editor') || 'editor',
        responserequired: bool(el, 'responserequired', true),
        responsefieldlines: num(el, 'responsefieldlines', 15),
        minwordlimit: val(el, 'minwordlimit'),
        maxwordlimit: val(el, 'maxwordlimit'),
        attachments: num(el, 'attachments', 0),
        attachmentsrequired: num(el, 'attachmentsrequired', 0),
        maxbytes: num(el, 'maxbytes', 0),
        filetypeslist: val(el, 'filetypeslist'),
        graderinfo: readText(el, 'graderinfo'),
        responsetemplate: readText(el, 'responsetemplate'),
      };
    case 'matching':
      return {
        ...base,
        ...readCombined(el),
        shuffleanswers: bool(el, 'shuffleanswers', true),
        subquestions: childrenNamed(el, 'subquestion').map((s) => ({
          id: uid(),
          text: readText(s),
          answer: innerText(child(child(s, 'answer'), 'text')).trim(),
        })),
      };
    case 'cloze':
    case 'multianswer':
      return { ...base, type: 'cloze' };
    case 'gapselect':
      return {
        ...base,
        ...readCombined(el),
        shuffleanswers: bool(el, 'shuffleanswers', true),
        choices: childrenNamed(el, 'selectoption').map((c) => ({
          id: uid(),
          text: innerText(child(c, 'text')),
          group: num(c, 'group', 1),
          infinite: false,
        })),
      };
    case 'ddwtos':
      return {
        ...base,
        ...readCombined(el),
        shuffleanswers: bool(el, 'shuffleanswers', true),
        choices: childrenNamed(el, 'dragbox').map((c) => ({
          id: uid(),
          text: innerText(child(c, 'text')),
          group: num(c, 'group', 1),
          infinite: !!child(c, 'infinite'),
        })),
      };
    case 'ordering': {
      const answers = childrenNamed(el, 'answer')
        .map((a, i) => ({ text: readText(a), order: parseFloat(a.attrs.fraction) || i + 1 }))
        .sort((a, b) => a.order - b.order);
      return {
        ...base,
        ...readCombined(el),
        layouttype: val(el, 'layouttype', 'VERTICAL') || 'VERTICAL',
        selecttype: val(el, 'selecttype', 'ALL') || 'ALL',
        selectcount: num(el, 'selectcount', 0),
        gradingtype: val(el, 'gradingtype', 'ABSOLUTE_POSITION') || 'ABSOLUTE_POSITION',
        showgrading: !/^(0|hide)$/i.test(val(el, 'showgrading', '1')),
        numberingstyle: val(el, 'numberingstyle', 'none') || 'none',
        items: answers.map((a) => ({ id: uid(), text: a.text })),
      };
    }
    case 'description':
      return base;
    default:
      warnings.push(`Skipped unsupported question type "${type}"${base.name ? ` ("${base.name}")` : ''}.`);
      return null;
  }
}

// ---------------------------------------------------------------- export

export function exportMoodleXml(quiz, questions = quiz.questions) {
  const warnings = [];
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz>'];
  let lastCategory = null;

  const writeCategory = (path, info) => {
    out.push(
      `  <!-- question: category -->`,
      `  <question type="category">`,
      `    <category>`,
      `      <text>${esc(path)}</text>`,
      `    </category>`,
      `    <info format="html">`,
      `      <text>${cdata(info || '')}</text>`,
      `    </info>`,
      `  </question>`,
      ''
    );
  };

  if (quiz.includeCategory && quiz.category) {
    writeCategory(quiz.category, quiz.info);
    lastCategory = quiz.category;
  }

  for (const q of questions) {
    if (quiz.includeCategory) {
      const cat = q.category?.trim() || quiz.category;
      if (cat && cat !== lastCategory) {
        writeCategory(cat, '');
        lastCategory = cat;
      }
    }
    out.push(...writeQuestion(q, warnings).map((l) => '  ' + l), '');
  }
  out.push('</quiz>', '');
  return { text: out.join('\n'), warnings };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cdata(s) {
  s = String(s ?? '');
  if (s === '') return '';
  if (!/[<>&]/.test(s)) return s;
  return '<![CDATA[' + s.replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
}

/** Replaces data: URIs with @@PLUGINFILE@@ references and returns the matching <file> elements. */
function extractFiles(html) {
  const files = [];
  let n = 0;
  const text = String(html ?? '').replace(/data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)/g, (m, mime, data) => {
    const name = `image${++n}.${EXT[mime] || 'bin'}`;
    files.push(`<file name="${name}" path="/" encoding="base64">${data.replace(/\s+/g, '')}</file>`);
    return `@@PLUGINFILE@@/${name}`;
  });
  return { text, files };
}

function textBlock(tag, html, format = 'html', extra = []) {
  const { text, files } = extractFiles(html);
  return [`<${tag} format="${format}">`, `  <text>${cdata(text)}</text>`, ...files.map((f) => '  ' + f), ...extra.map((l) => '  ' + l), `</${tag}>`];
}

const b10 = (v) => (v ? '1' : '0');
const fmtNum = (n, d = 7) => Number(n || 0).toFixed(d);
const fmtFraction = (f) => String(round(f, 5));

function combinedFeedback(q) {
  const lines = [
    ...textBlock('correctfeedback', q.correctfeedback ?? DEFAULT_COMBINED_FEEDBACK.correctfeedback),
    ...textBlock('partiallycorrectfeedback', q.partiallycorrectfeedback ?? DEFAULT_COMBINED_FEEDBACK.partiallycorrectfeedback),
    ...textBlock('incorrectfeedback', q.incorrectfeedback ?? DEFAULT_COMBINED_FEEDBACK.incorrectfeedback),
  ];
  if (q.shownumcorrect) lines.push('<shownumcorrect/>');
  return lines;
}

function answerBlock(a, fraction, format = 'html', extra = []) {
  const { text, files } = extractFiles(a.text);
  return [
    `<answer fraction="${fraction}" format="${format}">`,
    `  <text>${cdata(text)}</text>`,
    ...files.map((f) => '  ' + f),
    ...textBlock('feedback', a.feedback || '').map((l) => '  ' + l),
    ...extra.map((l) => '  ' + l),
    `</answer>`,
  ];
}

function writeQuestion(q, warnings) {
  const type = q.type === 'cloze' ? 'cloze' : q.type;
  const L = [`<!-- question: ${esc(q.name || defaultName(q)).replace(/--/g, '- -')} -->`, `<question type="${type}">`];
  const I = (lines) => L.push(...lines.map((l) => '  ' + l));

  I(['<name>', `  <text>${esc(q.name || defaultName(q))}</text>`, '</name>']);
  I(textBlock('questiontext', q.questiontext, q.questiontextformat || 'html'));
  I(textBlock('generalfeedback', q.generalfeedback || ''));
  if (q.type !== 'cloze') I([`<defaultgrade>${fmtNum(q.defaultgrade)}</defaultgrade>`]);
  I([`<penalty>${fmtNum(q.penalty)}</penalty>`, `<hidden>${b10(q.hidden)}</hidden>`, `<idnumber>${esc(q.idnumber || '')}</idnumber>`]);

  switch (q.type) {
    case 'multichoice':
      I([
        `<single>${q.single ? 'true' : 'false'}</single>`,
        `<shuffleanswers>${q.shuffleanswers ? 'true' : 'false'}</shuffleanswers>`,
        `<answernumbering>${esc(q.answernumbering || 'abc')}</answernumbering>`,
        `<showstandardinstruction>${b10(q.showstandardinstruction)}</showstandardinstruction>`,
      ]);
      I(combinedFeedback(q));
      for (const a of q.answers) I(answerBlock(a, fmtFraction(a.fraction)));
      break;
    case 'truefalse':
      I(answerBlock({ text: 'true', feedback: q.feedbacktrue }, q.correct ? 100 : 0, 'moodle_auto_format'));
      I(answerBlock({ text: 'false', feedback: q.feedbackfalse }, q.correct ? 0 : 100, 'moodle_auto_format'));
      break;
    case 'shortanswer':
      I([`<usecase>${b10(q.usecase)}</usecase>`]);
      for (const a of q.answers) I(answerBlock(a, fmtFraction(a.fraction), 'moodle_auto_format'));
      break;
    case 'numerical':
      for (const a of q.answers) I(answerBlock(a, fmtFraction(a.fraction), 'moodle_auto_format', [`<tolerance>${Number(a.tolerance) || 0}</tolerance>`]));
      if (q.units?.length) {
        I(['<units>']);
        for (const u of q.units) I(['  <unit>', `    <multiplier>${Number(u.multiplier) || 1}</multiplier>`, `    <unit_name>${esc(u.unit)}</unit_name>`, '  </unit>']);
        I(['</units>']);
      }
      I([
        `<unitgradingtype>${q.unitgradingtype ?? 0}</unitgradingtype>`,
        `<unitpenalty>${fmtNum(q.unitpenalty ?? 0.1)}</unitpenalty>`,
        `<showunits>${q.showunits ?? 3}</showunits>`,
        `<unitsleft>${b10(q.unitsleft)}</unitsleft>`,
      ]);
      break;
    case 'essay':
      I([
        `<responseformat>${esc(q.responseformat)}</responseformat>`,
        `<responserequired>${b10(q.responserequired)}</responserequired>`,
        `<responsefieldlines>${q.responsefieldlines}</responsefieldlines>`,
        `<minwordlimit>${esc(q.minwordlimit ?? '')}</minwordlimit>`,
        `<maxwordlimit>${esc(q.maxwordlimit ?? '')}</maxwordlimit>`,
        `<attachments>${q.attachments}</attachments>`,
        `<attachmentsrequired>${q.attachmentsrequired}</attachmentsrequired>`,
        `<maxbytes>${q.maxbytes ?? 0}</maxbytes>`,
        `<filetypeslist>${esc(q.filetypeslist ?? '')}</filetypeslist>`,
      ]);
      I(textBlock('graderinfo', q.graderinfo || ''));
      I(textBlock('responsetemplate', q.responsetemplate || ''));
      break;
    case 'matching':
      I([`<shuffleanswers>${q.shuffleanswers ? 'true' : 'false'}</shuffleanswers>`]);
      I(combinedFeedback(q));
      for (const s of q.subquestions) {
        I(textBlock('subquestion', s.text, 'html', ['<answer>', `  <text>${esc(s.answer)}</text>`, '</answer>']));
      }
      break;
    case 'gapselect':
    case 'ddwtos': {
      I([`<shuffleanswers>${b10(q.shuffleanswers)}</shuffleanswers>`]);
      I(combinedFeedback(q));
      const tag = q.type === 'gapselect' ? 'selectoption' : 'dragbox';
      for (const c of q.choices) {
        I([`<${tag}>`, `  <text>${esc(c.text)}</text>`, `  <group>${c.group || 1}</group>`, ...(q.type === 'ddwtos' && c.infinite ? ['  <infinite/>'] : []), `</${tag}>`]);
      }
      break;
    }
    case 'ordering':
      I([
        `<layouttype>${q.layouttype}</layouttype>`,
        `<selecttype>${q.selecttype}</selecttype>`,
        `<selectcount>${q.selectcount || 0}</selectcount>`,
        `<gradingtype>${q.gradingtype}</gradingtype>`,
        `<showgrading>${q.showgrading ? 'SHOW' : 'HIDE'}</showgrading>`,
        `<numberingstyle>${esc(q.numberingstyle || 'none')}</numberingstyle>`,
      ]);
      I(combinedFeedback(q));
      q.items.forEach((it, i) => I(answerBlock({ text: it.text, feedback: '' }, i + 1)));
      break;
    case 'cloze':
    case 'description':
      break;
    default:
      warnings.push(`Unknown question type "${q.type}" was exported without type-specific data.`);
  }

  for (const h of q.hints || []) if (h.text?.trim()) I(textBlock('hint', h.text));
  if (q.tags?.length) {
    I(['<tags>', ...q.tags.map((t) => `  <tag><text>${esc(t)}</text></tag>`), '</tags>']);
  }
  L.push('</question>');
  return L;
}

export function defaultName(q) {
  const t = String(q.questiontext || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, '___')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, 60) || 'Question';
}
