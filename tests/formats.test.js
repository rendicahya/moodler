import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuiz, createQuestion, normalizeQuiz, newAnswer } from '../src/lib/model.js';
import { importMoodleXml, exportMoodleXml } from '../src/lib/formats/moodlexml.js';
import { importGift, exportGift } from '../src/lib/formats/gift.js';
import { importAiken, exportAiken } from '../src/lib/formats/aiken.js';
import { parseCloze, buildCloze } from '../src/lib/formats/cloze.js';
import { detectFormat } from '../src/lib/formats/index.js';

const strip = (q) => JSON.parse(JSON.stringify(q, (k, v) => (k === 'id' ? undefined : v)));

function sampleQuiz() {
  const quiz = createQuiz();
  quiz.category = '$course$/top/Sample';
  const mc = createQuestion('multichoice');
  Object.assign(mc, { name: 'Capital', questiontext: '<p>Capital of <b>France</b>?</p>' });
  mc.answers = [
    newAnswer({ text: 'Paris', fraction: 100, feedback: 'Yes' }),
    newAnswer({ text: 'Lyon', fraction: 0, feedback: 'No' }),
    newAnswer({ text: 'Nice & <b>sunny</b>', fraction: 0 }),
  ];
  const multi = createQuestion('multichoice');
  Object.assign(multi, { name: 'Primes', questiontext: 'Which are prime?', single: false });
  multi.answers = [newAnswer({ text: '2', fraction: 50 }), newAnswer({ text: '3', fraction: 50 }), newAnswer({ text: '4', fraction: -100 })];
  const tf = createQuestion('truefalse');
  Object.assign(tf, { name: 'Sky', questiontext: 'The sky is blue.', correct: true, feedbacktrue: 'Right', feedbackfalse: 'Wrong' });
  const sa = createQuestion('shortanswer');
  Object.assign(sa, { name: 'Two', questiontext: '1+1 = ?' });
  sa.answers = [newAnswer({ text: 'two', fraction: 100 }), newAnswer({ text: '2', fraction: 100 })];
  const num = createQuestion('numerical');
  Object.assign(num, { name: 'Pi', questiontext: 'Value of pi?' });
  num.answers = [newAnswer({ text: '3.14', tolerance: 0.01, fraction: 100 }), newAnswer({ text: '3', tolerance: 0, fraction: 50 })];
  const essay = createQuestion('essay');
  Object.assign(essay, { name: 'Essay', questiontext: 'Discuss.' });
  const mat = createQuestion('matching');
  Object.assign(mat, { name: 'Match', questiontext: 'Match the capitals' });
  mat.subquestions = [
    { text: 'France', answer: 'Paris' },
    { text: 'Germany', answer: 'Berlin' },
    { text: 'Italy', answer: 'Rome' },
  ];
  const desc = createQuestion('description');
  Object.assign(desc, { name: 'Intro', questiontext: 'Read carefully.' });
  return { quiz, questions: [mc, multi, tf, sa, num, essay, mat, desc] };
}

test('Moodle XML round trip of all types', () => {
  const { quiz } = sampleQuiz();
  const all = sampleQuiz().questions;
  for (const t of ['cloze', 'gapselect', 'ddwtos', 'ordering']) {
    const q = createQuestion(t);
    q.name = t;
    if (t === 'ordering') q.items = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    all.push(q);
  }
  all[0].hints = [{ text: 'Think about it' }];
  all[0].tags = ['geo', 'europe'];
  quiz.questions = all;
  const n = normalizeQuiz(quiz);
  const { text, warnings } = exportMoodleXml(n);
  assert.deepEqual(warnings, []);
  const back = importMoodleXml(text);
  assert.deepEqual(back.warnings, []);
  assert.equal(back.quiz.category, '$course$/top/Sample');
  const reimported = normalizeQuiz({ ...n, questions: back.questions });
  assert.equal(reimported.questions.length, n.questions.length);
  for (let i = 0; i < n.questions.length; i++) {
    assert.deepEqual(strip(reimported.questions[i]), strip(n.questions[i]), `question ${n.questions[i].type}`);
  }
});

test('Moodle XML embedded images become data URIs and back', () => {
  const xml = `<?xml version="1.0"?><quiz><question type="description"><name><text>img</text></name>
  <questiontext format="html"><text><![CDATA[<p><img src="@@PLUGINFILE@@/a%20b.png"></p>]]></text>
  <file name="a b.png" path="/" encoding="base64">iVBORw0KGgo=</file></questiontext></question></quiz>`;
  const { questions } = importMoodleXml(xml);
  assert.match(questions[0].questiontext, /data:image\/png;base64,iVBORw0KGgo=/);
  const out = exportMoodleXml({ ...createQuiz(), includeCategory: false }, normalizeQuiz({ questions }).questions).text;
  assert.match(out, /@@PLUGINFILE@@\/image1\.png/);
  assert.match(out, /<file name="image1.png" path="\/" encoding="base64">iVBORw0KGgo=<\/file>/);
});

test('GIFT round trip of supported types', () => {
  const { quiz, questions } = sampleQuiz();
  quiz.questions = questions;
  const n = normalizeQuiz(quiz);
  const { text } = exportGift(n);
  const back = importGift(text);
  assert.deepEqual(back.warnings, []);
  assert.equal(back.questions.length, n.questions.length);
  const types = back.questions.map((q) => q.type);
  assert.deepEqual(types, n.questions.map((q) => q.type));
  const [mc, multi, tf, sa, num, , mat] = back.questions;
  assert.equal(mc.questiontext, '<p>Capital of <b>France</b>?</p>');
  assert.deepEqual(mc.answers.map((a) => [a.text, a.fraction, a.feedback]), [['Paris', 100, 'Yes'], ['Lyon', 0, 'No'], ['Nice & <b>sunny</b>', 0, '']]);
  assert.equal(multi.single, false);
  assert.deepEqual(multi.answers.map((a) => a.fraction), [50, 50, -100]);
  assert.equal(tf.correct, true);
  assert.equal(tf.feedbacktrue, 'Right');
  assert.equal(tf.feedbackfalse, 'Wrong');
  assert.deepEqual(sa.answers.map((a) => a.text), ['two', '2']);
  assert.deepEqual(num.answers.map((a) => [a.text, a.tolerance, a.fraction]), [['3.14', 0.01, 100], ['3', 0, 50]]);
  assert.deepEqual(mat.subquestions.map((s) => [s.text, s.answer]), [['France', 'Paris'], ['Germany', 'Berlin'], ['Italy', 'Rome']]);
  assert.equal(back.quiz.category, '$course$/top/Sample');
});

test('GIFT parses documentation examples', () => {
  const src = `// comment
::Q1:: Who's buried in Grant's tomb?{~Grant ~Jefferson =no one}

Grant is {~buried =entombed ~living} in Grant's tomb.

Grant is buried in Grant's tomb.{F}

::Q4:: Two plus two equals {=four =4}

Match the following countries with their corresponding capitals. {
    =Canada -> Ottawa
    =Italy  -> Rome
}

When was Ulysses S. Grant born?{#1822:5}

What is the value of pi (to 3 decimal places)? {#3.141..3.142}

Write a short biography of Dag Hammarskjöld. {}

What's 2 + 2? {=four#Right \\= yes ####General feedback}

Escaped \\{braces\\} and colon\\: here {T}`;
  const { questions, warnings } = importGift(src);
  assert.deepEqual(warnings, []);
  assert.deepEqual(questions.map((q) => q.type), ['multichoice', 'multichoice', 'truefalse', 'shortanswer', 'matching', 'numerical', 'numerical', 'essay', 'shortanswer', 'truefalse']);
  assert.equal(questions[0].name, 'Q1');
  assert.equal(questions[1].questiontext, 'Grant is _____ in Grant&#39;s tomb.'.replace('&#39;', "'"));
  assert.equal(questions[2].correct, false);
  assert.equal(questions[5].answers[0].tolerance, 5);
  assert.equal(questions[6].answers[0].text, '3.1415');
  assert.equal(questions[8].answers[0].feedback, 'Right = yes');
  assert.equal(questions[8].generalfeedback, 'General feedback');
  assert.equal(questions[9].questiontext, 'Escaped {braces} and colon: here');
});

test('Aiken import and export', () => {
  const src = `What is the correct answer to this question?
A. Is it this one?
B. Maybe this answer?
C) Possibly this one?
ANSWER: A

Which LMS has the most quiz import formats?
A) Moodle
B) ATutor
ANSWER: A`;
  const { questions, warnings } = importAiken(src);
  assert.deepEqual(warnings, []);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].answers.map((a) => a.fraction), [100, 0, 0]);
  const quiz = normalizeQuiz({ questions });
  const out = exportAiken(quiz).text;
  assert.equal(out.trim(), src.replace('C) ', 'C. ').replace(/A\) /g, 'A. ').replace('B) ', 'B. ').trim());
});

test('Cloze parse and build', () => {
  const text = 'A {1:SHORTANSWER:=Berlin#Good~%50%berlin} B {2:MC:Wrong#No~=Right#Yes} C {:NM:=3.14:0.01}';
  const gaps = parseCloze(text);
  assert.equal(gaps.length, 3);
  assert.equal(gaps[1].type, 'MULTICHOICE');
  assert.equal(gaps[2].answers[0].tolerance, 0.01);
  assert.equal(buildCloze(gaps[0]), '{1:SHORTANSWER:=Berlin#Good~%50%berlin}');
  assert.equal(buildCloze(gaps[1]), '{2:MULTICHOICE:Wrong#No~=Right#Yes}');
  assert.equal(buildCloze(gaps[2]), '{1:NUMERICAL:=3.14:0.01}');
});

test('Format detection', () => {
  assert.equal(detectFormat('<?xml version="1.0"?><quiz></quiz>'), 'xml');
  assert.equal(detectFormat('Q?\nA. x\nB. y\nANSWER: A'), 'aiken');
  assert.equal(detectFormat('::T:: Q {=a ~b}'), 'gift');
  assert.equal(detectFormat('Berlin is {1:SHORTANSWER:=capital}'), 'cloze');
});
