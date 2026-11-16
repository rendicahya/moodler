import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { answerKeyReport, balanceAnswers, correctPosition, correctIsLongest, findDuplicates, isPinned } from '../src/lib/quality.js';
import { officeText, xmlText } from '../src/lib/extract.js';
import { buildPrompt } from '../src/lib/prompt.js';

let n = 0;
const mc = (texts, correct = 0) => ({
  id: `q${++n}`,
  type: 'multichoice',
  single: true,
  questiontext: `<p>Question ${n} about topic ${n * 7}</p>`,
  answers: texts.map((text, i) => ({ id: `a${n}-${i}`, text, fraction: i === correct ? 100 : 0 })),
});

test('the answer key report finds a key that is always in the same place', () => {
  const qs = Array.from({ length: 8 }, () => mc(['w', 'right', 'x', 'y'], 1));
  const r = answerKeyReport(qs);
  assert.deepEqual(r.positions, [0, 8, 0, 0]);
  assert.equal(r.skewed, true);
  const even = Array.from({ length: 8 }, (_, i) => mc(['a', 'b', 'c', 'd'], i % 4));
  assert.equal(answerKeyReport(even).skewed, false);
  // Multiple-response and other types are not counted.
  assert.equal(correctPosition({ ...mc(['a', 'b']), single: false }), -1);
  assert.equal(correctPosition({ type: 'truefalse' }), -1);
});

test('spreading the key evenly keeps each question intact and pins "all of the above"', () => {
  const qs = Array.from({ length: 12 }, () => mc(['right', 'wrong 1', 'wrong 2', 'All of the above'], 0));
  const before = qs.map((q) => new Set(q.answers.map((a) => a.id)));
  balanceAnswers(qs);
  const r = answerKeyReport(qs);
  // "All of the above" stays last, so the key is spread over the first three positions.
  assert.deepEqual(r.positions, [4, 4, 4, 0]);
  qs.forEach((q, i) => {
    assert.deepEqual(new Set(q.answers.map((a) => a.id)), before[i]);
    assert.equal(q.answers[3].text, 'All of the above');
    assert.equal(q.answers.filter((a) => a.fraction === 100)[0].text, 'right');
  });
  assert.equal(isPinned({ text: 'Semua jawaban benar' }), true);
  assert.equal(isPinned({ text: 'A dan B' }), true);
  assert.equal(isPinned({ text: 'Paris' }), false);
});

test('a correct answer much longer than the others is noticed', () => {
  assert.equal(correctIsLongest(mc(['It converts light energy into chemical energy stored in glucose', 'Heat', 'Sound', 'Wind'])), true);
  assert.equal(correctIsLongest(mc(['Paris', 'London', 'Berlin', 'Madrid'])), false);
});

test('repeated questions are grouped, within a quiz and across quizzes', () => {
  const q = (id, text, answers = ['Paris', 'Lyon', 'Nice']) => ({ id, type: 'multichoice', questiontext: text, answers: answers.map((t) => ({ text: t })) });
  const a = q('a', '<p>What is the capital city of France?</p>');
  const b = q('b', '<p>What is the capital city of France ?</p>');
  const c = q('c', '<p>Which river flows through the city of Paris?</p>', ['Seine', 'Loire', 'Rhone']);
  const d = q('d', 'What is the capital city of France?');
  const entries = [
    { id: 'a', quizId: 'one', q: a },
    { id: 'b', quizId: 'one', q: b },
    { id: 'c', quizId: 'one', q: c },
    { id: 'd', quizId: 'two', q: d },
  ];
  const groups = findDuplicates(entries, { focus: 'one' });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].entries.map((e) => e.id).sort(), ['a', 'b', 'd']);
  assert.equal(groups[0].score, 1);
  // Pairs between two other quizzes are not reported.
  assert.equal(findDuplicates([entries[3], { ...entries[0], quizId: 'three' }], { focus: 'one' }).length, 0);
  // Short questions only count when identical.
  const s1 = { id: 's1', quizId: 'one', q: { type: 'numerical', questiontext: '2 + 2 =', answers: [{ text: '4' }] } };
  const s2 = { id: 's2', quizId: 'one', q: { type: 'numerical', questiontext: '2 + 3 =', answers: [{ text: '5' }] } };
  assert.equal(findDuplicates([s1, s2]).length, 0);
});

test('text is read from Word, PowerPoint and OpenDocument files', () => {
  const docx = zipSync({
    'word/document.xml': strToU8(
      '<w:document><w:body><w:p><w:r><w:t>Photosynthesis &amp; light</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Plants </w:t></w:r><w:r><w:instrText>PAGE</w:instrText><w:t>make sugar.</w:t></w:r></w:p>' +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>CO2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>in</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
    ),
  });
  assert.equal(officeText(docx, 'docx'), 'Photosynthesis & light\nPlants make sugar.\nCO2\tin');

  const pptx = zipSync({
    'ppt/slides/slide10.xml': strToU8('<p:sld><a:p><a:r><a:t>Last</a:t></a:r></a:p></p:sld>'),
    'ppt/slides/slide2.xml': strToU8('<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>'),
    'ppt/slides/slide1.xml': strToU8('<p:sld><a:p><a:r><a:t>Title</a:t></a:r><a:br/><a:r><a:t>Sub</a:t></a:r></a:p></p:sld>'),
  });
  assert.equal(officeText(pptx, 'pptx'), '[Slide 1]\nTitle\nSub\n\n[Slide 2]\nSecond\n\n[Slide 10]\nLast');

  const odt = zipSync({ 'content.xml': strToU8('<office:text><text:h>Heading</text:h><text:p>One<text:s/>two<text:tab/>three</text:p></office:text>') });
  assert.equal(officeText(odt, 'odt'), 'Heading\nOne two\tthree');
  assert.throws(() => officeText(zipSync({ 'x.txt': strToU8('x') }), 'docx'), /not a Word document/);
  assert.equal(xmlText('<a:p><a:t>&lt;tag&gt;</a:t></a:p>'), '<tag>');
});

test('material files go into the prompt as text, or are named as attachments', () => {
  const p = buildPrompt({
    topic: 'Cells',
    counts: { multichoice: 3 },
    files: [
      { name: 'chapter1.pdf', text: 'Cells are the unit of life.' },
      { name: 'scan.pdf', text: '' },
    ],
  });
  assert.match(p, /I have attached a file to this message: "scan\.pdf"/);
  assert.match(p, /source material below and in the attached file;/);
  assert.match(p, /Spread the questions over all of the source material/);
  assert.match(p, /Source material from the file "chapter1\.pdf":\n"""\nCells are the unit of life\.\n"""$/);
  const none = buildPrompt({ topic: 'Cells', counts: { multichoice: 3 } });
  assert.doesNotMatch(none, /attached|Source material/);
});

import { placeProblem, fixPlace, lookAlikeAnswers, imagesWithoutAlt, setImageAlt, altIsMissing, placeName } from '../src/lib/quality.js';

test('answers like "All of the above" are flagged when shuffled or not last, and fixed', () => {
  const q = { ...mc(['Red', 'All of the above', 'Blue', 'Green']), shuffleanswers: true };
  assert.equal(placeProblem(q), 'shuffled');
  assert.equal(fixPlace(q), true);
  assert.equal(q.shuffleanswers, false);
  assert.deepEqual(q.answers.map((a) => a.text), ['Red', 'Blue', 'Green', 'All of the above']);
  assert.equal(placeProblem(q), null);
  // Two at the end are fine; "A and B" only matters when shuffled.
  assert.equal(placeProblem({ ...mc(['x', 'y', 'All of the above', 'None of the above']), shuffleanswers: false }), null);
  assert.equal(placeProblem({ ...mc(['x', 'y', 'A and B']), shuffleanswers: true }), 'shuffled');
  assert.equal(placeProblem({ ...mc(['Semua jawaban di atas benar', 'x', 'y']), shuffleanswers: false }), 'notLast');
  // Ordinary answers that happen to mention a word are not.
  assert.equal(placeProblem({ ...mc(['The bird flew above the clouds and far away into the sunset over the sea', 'x']), shuffleanswers: true }), null);
  assert.equal(placeProblem({ ...mc(['Paris', 'Rome']), shuffleanswers: true }), null);
});

test('answers that look alike are found, but different ones are not', () => {
  assert.deepEqual(lookAlikeAnswers(mc(['Photosynthesis', ' photosynthesis.', 'Respiration'])), [{ what: 'answers', a: 1, b: 2, kind: 'same' }]);
  assert.deepEqual(lookAlikeAnswers(mc(['red and blue', 'Blue and red', 'green'])), [{ what: 'answers', a: 1, b: 2, kind: 'reordered' }]);
  assert.deepEqual(lookAlikeAnswers(mc(['The pressure increases', 'The pressure decreases', '1998', '1989'])), []);
  assert.deepEqual(lookAlikeAnswers(mc(['', '<p></p>', 'x'])), []);
  const gaps = { type: 'gapselect', choices: [{ text: 'cat', group: 1 }, { text: 'Cat', group: 2 }, { text: 'cat', group: 1 }] };
  assert.deepEqual(lookAlikeAnswers(gaps), [{ what: 'choices', a: 1, b: 3, kind: 'same' }]);
  const match = { type: 'matching', subquestions: [{ text: '', answer: 'x' }, { text: 'Dog', answer: 'a' }, { text: 'dog', answer: 'b' }] };
  assert.deepEqual(lookAlikeAnswers(match), [{ what: 'questions', a: 2, b: 3, kind: 'same' }]);
});

test('pictures without a useful description are found and can be described', () => {
  assert.equal(altIsMissing(''), true);
  assert.equal(altIsMissing('image.png'), true);
  assert.equal(altIsMissing('IMG_2024.JPG'), true);
  assert.equal(altIsMissing('Screenshot 2'), true);
  assert.equal(altIsMissing('A right triangle with sides 3, 4 and 5'), false);
  const q = {
    ...mc(['<img src="data:image/png;base64,AA">', 'b']),
    questiontext: '<p><img alt="image.png" src="data:a"> and <img src="data:b" alt="A cell"> <img src=\'data:c\'></p>',
  };
  const found = imagesWithoutAlt(q);
  assert.deepEqual(found.map((f) => [f.path.join('.'), f.index, f.src]), [['questiontext', 0, 'data:a'], ['questiontext', 2, 'data:c'], ['answers.0.text', 0, 'data:image/png;base64,AA']]);
  setImageAlt(q, ['questiontext'], 2, 'A "big" <cell>');
  setImageAlt(q, ['answers', 0, 'text'], 0, 'Mitochondrion');
  assert.equal(q.questiontext, '<p><img alt="image.png" src="data:a"> and <img src="data:b" alt="A cell"> <img alt="A &quot;big&quot; &lt;cell&gt;" src=\'data:c\'></p>');
  assert.equal(q.answers[0].text, '<img alt="Mitochondrion" src="data:image/png;base64,AA">');
  setImageAlt(q, ['questiontext'], 0, 'Graph');
  assert.match(q.questiontext, /^<p><img alt="Graph" src="data:a">/);
  assert.equal(imagesWithoutAlt(q).length, 0);
  assert.equal(placeName(['answers', 1, 'feedback']), 'the feedback of answer 2');
  assert.equal(placeName(['questiontext']), 'the question text');
});

test('"All of the above" as the key is not counted as the longest answer', () => {
  assert.equal(correctIsLongest(mc(['Red', 'Blue', 'Green', 'All of the above'], 3)), false);
  assert.equal(correctIsLongest(mc(['A much longer correct answer here', 'Blue', 'Green', 'None of the above'], 0)), true);
});
