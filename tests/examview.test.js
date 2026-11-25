import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuiz, createQuestion, newAnswer } from '../src/lib/model.js';
import { exportExamview, examviewText } from '../src/lib/formats/examview.js';
import { parseXml, child, childrenNamed, innerText } from '../src/lib/formats/xmlparser.js';

const make = (type, fields) => Object.assign(createQuestion(type), fields);

function run(questions, opts) {
  const { text, warnings } = exportExamview(createQuiz(), questions, opts);
  const root = child(parseXml(text), 'examview');
  const list = root ? childrenNamed(root, 'question') : [];
  return { text, warnings, root, list, get: (i, name) => innerText(child(list[i], name)) };
}

test('HTML becomes text with the tags ExamView has', () => {
  assert.equal(examviewText('<p>H<sub>2</sub>O is <strong>not <em>x</em></strong> &amp; a &lt; b</p>'), 'H<sub>2</sub>O is <b>not </b><b><i>x</i></b> &amp; a &lt; b');
  assert.equal(examviewText('<p>One  \n two</p>\n<p>Three<br>four<br></p><p></p><p>five</p>'), 'One two\nThree\nfour\nfive');
  assert.equal(examviewText('<u>é 😀</u>'), '<i>&#xe9; &#x1f600;</i>');
  assert.equal(examviewText('<ul><li><p>a</p></li><li>b<ol><li><p>c</p><p>d</p></li></ol></li></ul><p>e</p>'), '&#x2022; a\n&#x2022; b\n&#xa0;&#xa0;&#xa0;&#xa0;1. c\nd\ne');
  assert.equal(examviewText('<p>Code:</p><pre><code>\nif (x) {\n    y();\n\n}</code></pre><p>end</p>'), 'Code:\nif (x) {\n&#xa0;&#xa0;&#xa0;&#xa0;y();\n\n}\nend');
  const lost = new Set();
  assert.equal(examviewText('<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td>1</td><td>2</td></tr></tbody></table><img src="a>b" alt="cat"><img src="x">', lost), '<b>A | B</b>\n1 | 2\n[cat][picture]');
  assert.deepEqual([...lost], ['table lines', 'pictures']);
  assert.equal(examviewText(''), '');
  assert.equal(examviewText('a \u0000<style>p{}</style>b<!-- <i> -->'), 'a b');
});

test('ExamView XML has each question in the type ExamView uses', () => {
  const mc = make('multichoice', { questiontext: '<p>Capital?</p>', generalfeedback: 'Because.' });
  mc.answers = [newAnswer({ text: 'Lyon' }), newAnswer({ text: ' ' }), newAnswer({ text: '<p>Paris</p>', fraction: 100 })];
  const multi = make('multichoice', { questiontext: 'Primes?', single: false });
  multi.answers = [newAnswer({ text: '2', fraction: 50 }), newAnswer({ text: '4', fraction: -100 }), newAnswer({ text: '3', fraction: 50 })];
  const sa = make('shortanswer', { questiontext: 'Two?', answers: [newAnswer({ text: 'two', fraction: 100 }), newAnswer({ text: '2', fraction: 100 }), newAnswer({ text: '*', fraction: 0 })] });
  const co = make('shortanswer', { questiontext: 'Say _____.', answers: [newAnswer({ text: 'x', fraction: 100 })] });
  const nr = make('numerical', { questiontext: 'Pi?', answers: [newAnswer({ text: '3.14', fraction: 100, tolerance: 0.01 }), newAnswer({ text: '3', fraction: 50 })] });
  const ma = make('matching', { questiontext: 'Match', subquestions: [{ text: 'Cat', answer: 'Meow' }, { text: 'Dog', answer: 'Bark' }, { text: '', answer: 'Chirp' }] });
  const cloze = make('cloze', { questiontext: 'Is {1:SHORTANSWER:=Paris~=paris} {1:MULTICHOICE:=red~blue}.' });
  const gs = make('gapselect', { questiontext: 'The [[2]] on the [[1]].' });
  const or = make('ordering', { questiontext: 'Order', items: ['one', 'two', 'three'].map((text) => ({ text })) });
  const { text, list, get, root, warnings } = run([mc, multi, make('truefalse', { questiontext: 'Sky', correct: false }), sa, co, nr, ma, cloze, gs, or, make('essay', { questiontext: 'Why?', graderinfo: '<b>So</b>' }), make('description', { questiontext: 'Read' })]);

  assert.equal(root.attrs.type, 'test');
  assert.deepEqual(list.map((q) => q.attrs.type), ['mc', 'sa', 'tf', 'sa', 'co', 'nr', 'ma', 'ma', 'co', 'co', 'sa', 'es']);
  assert.deepEqual(list.map((q) => q.attrs['question-id']), list.map((_, i) => String(i + 1)));
  // The empty answer is gone, so the right one moves up.
  assert.equal(get(0, 'answer'), 'B');
  assert.equal(innerText(child(child(list[0], 'choices'), 'choice-b')), 'Paris');
  assert.equal(get(0, 'rationale'), 'Because.');
  assert.equal(get(1, 'text'), 'Primes?\n\nA. 2\nB. 4\nC. 3');
  assert.equal(get(1, 'answer'), 'A, C');
  assert.equal(get(2, 'answer'), 'F');
  assert.equal(get(3, 'answer'), 'two\n2');
  assert.equal(get(5, 'answer'), '3.14');
  const group = child(root, 'matching-group');
  assert.equal(group.attrs.name, list[6].attrs.group);
  assert.deepEqual(child(group, 'choices').children.filter((c) => c.name).map(innerText), ['Bark', 'Chirp', 'Meow']);
  assert.deepEqual([get(6, 'answer'), get(7, 'answer')], ['C', 'A']);
  assert.equal(get(8, 'text'), 'Is (1) ____________ (2) ____________ [red / blue].');
  assert.equal(get(8, 'answer'), '(1) Paris / paris\n(2) red');
  assert.equal(get(9, 'text'), 'The (1) ____________ on the (2) ____________.\n\n[cat / mat / dog]');
  assert.equal(get(9, 'answer'), '(1) mat\n(2) cat');
  const order = get(10, 'text').split('\n').slice(2);
  assert.deepEqual(get(10, 'answer').split(', ').map((l) => order.find((o) => o.startsWith(l)).slice(3)), ['one', 'two', 'three']);
  assert.equal(get(11, 'answer'), '<b>So</b>');
  assert.match(text, /^[\x00-\x7f]*$/);
  assert.ok(warnings.some((w) => w.includes('"Read" was skipped')));
  assert.ok(warnings.some((w) => w === '"Pi?": left out partial credit, tolerance.'));
});

test('ExamView XML can be a question bank, says when there are too many questions, and is empty without any', () => {
  assert.equal(run([make('truefalse', { questiontext: 'x' })], { type: 'bank' }).root.attrs.type, 'bank');
  const many = run(Array.from({ length: 251 }, () => make('truefalse', { questiontext: 'x', defaultgrade: 2 })));
  assert.equal(many.warnings.length, 2);
  assert.match(many.warnings[1], /251 questions/);
  assert.equal(exportExamview(createQuiz(), [make('description', {})]).text, '');
});

test('A calculated question is written with its first set of values', () => {
  const q = createQuestion('calculated');
  q.datasets.forEach((d, i) => (d.items = d.items.map(() => i + 2)));
  const { get, list } = run([q]);
  assert.equal(list[0].attrs.type, 'nr');
  assert.doesNotMatch(get(0, 'text'), /[{}]/);
  assert.match(get(0, 'answer'), /^\d+(\.\d+)?$/);
});
