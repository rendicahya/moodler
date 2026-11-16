import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVersions, examCheck, sheetItems, sheetPages, sheetFrame, codeBits, readCode, parseTyped, formatAnswers, answerScore, markSheet, CODE_BITS, SHEET } from '../src/lib/exam.js';
import { homography } from '../src/lib/omr.js';
import { replacesVersion, AUTO_SESSION } from '../src/lib/cloud.js';

const mc = (id, texts, correct = 0, extra = {}) => ({
  id,
  type: 'multichoice',
  single: true,
  shuffleanswers: true,
  answernumbering: 'abc',
  defaultgrade: 1,
  questiontext: id,
  answers: texts.map((text, i) => ({ id: `${id}${i}`, text, fraction: i === correct ? 100 : 0 })),
  ...extra,
});

const QUIZ = [
  { id: 'intro', type: 'description', questiontext: 'Part 1' },
  ...Array.from({ length: 6 }, (_, i) => mc(`q${i}`, ['w', 'x', 'y', 'z', 'All of the above'], i % 4)),
  { id: 'part2', type: 'description', questiontext: 'Part 2' },
  { id: 'tf', type: 'truefalse', correct: false, defaultgrade: 2, questiontext: 'tf' },
  { id: 'essay', type: 'essay', defaultgrade: 5, questiontext: 'essay' },
];

test('exam versions shuffle within sections, keep pinned answers, and come out the same every time', () => {
  const versions = makeVersions(QUIZ, 3);
  assert.deepEqual(versions.map((v) => v.label), ['A', 'B', 'C']);
  assert.deepEqual(makeVersions(QUIZ, 3), versions);
  for (const { questions } of versions) {
    assert.deepEqual(questions.map((q) => q.id).sort(), QUIZ.map((q) => q.id).sort());
    // Descriptions stay where they were, so a part's questions stay in that part.
    assert.equal(questions[0].id, 'intro');
    assert.equal(questions[7].id, 'part2');
    for (const q of questions.filter((q) => q.type === 'multichoice')) {
      assert.equal(q.answers[4].text, 'All of the above');
      const original = QUIZ.find((x) => x.id === q.id);
      assert.equal(q.answers.find((a) => a.fraction === 100).id, original.answers.find((a) => a.fraction === 100).id);
    }
  }
  assert.notDeepEqual(versions[0].questions.map((q) => q.id), versions[1].questions.map((q) => q.id));
  assert.deepEqual(makeVersions(QUIZ, 1), [{ label: '', questions: QUIZ }]);
  const fixed = makeVersions(QUIZ, 2, { shuffleQuestions: false, shuffleAnswers: true });
  assert.deepEqual(fixed[1].questions.map((q) => q.id), QUIZ.map((q) => q.id));
  // Answers that name others by letter keep their order.
  const named = mc('n', ['p', 'q', 'r', 'a and b'], 3);
  for (const v of makeVersions([named, mc('m', ['1', '2', '3'])], 4)) assert.deepEqual(v.questions.find((q) => q.id === 'n').answers.map((a) => a.text), ['p', 'q', 'r', 'a and b']);
  assert.notEqual(examCheck(QUIZ, 2), examCheck(QUIZ, 3));
  assert.ok(examCheck(QUIZ, 2) >= 0 && examCheck(QUIZ, 2) < 256);
});

test('the answer sheet has the choice questions with their paper numbers', () => {
  const items = sheetItems(QUIZ);
  assert.deepEqual(items.map((i) => i.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(items[6].labels, ['T', 'F']);
  assert.deepEqual(items[6].fractions, [0, 100]);
  assert.deepEqual(items[0].labels, ['a', 'b', 'c', 'd', 'e']);
});

test('sheet pages hold every question once, inside the frame', () => {
  const many = Array.from({ length: 300 }, (_, i) => mc(`q${i}`, ['a', 'b', 'c', 'd'], 0));
  const frame = sheetFrame(180, 263);
  const pages = sheetPages(sheetItems(many), frame);
  assert.ok(pages.length >= 2 && pages.length <= 4);
  assert.deepEqual(pages.flatMap((p) => p.items.map((x) => x.index)), many.map((_, i) => i));
  for (const b of pages.flatMap((p) => p.items.flatMap((x) => x.bubbles))) {
    assert.ok(b.x - SHEET.bubble / 2 >= 0 && b.x + SHEET.bubble / 2 <= frame.width);
    assert.ok(b.y > SHEET.top && b.y + SHEET.bubble / 2 <= frame.height - SHEET.marker / 2);
  }
});

test('the code squares carry the version, page and check, and an upside-down reading is refused', () => {
  const bits = codeBits(2, 1, 0xa7);
  assert.equal(bits.length, CODE_BITS);
  assert.deepEqual(readCode(bits), { version: 2, page: 1, check: 0xa7 });
  assert.equal(readCode([...bits].reverse()), null);
});

test('typed answers are read with or without spaces', () => {
  const items = sheetItems(QUIZ);
  const fmt = (text) => formatAnswers(parseTyped(text, items), items);
  assert.equal(fmt('abcde?f'), 'A B C D E - F');
  assert.equal(fmt('A, BD 3 - x 1 s'), 'A BD C - - A F');
  assert.equal(fmt('ab'), 'A B - - - - -');
  assert.equal(fmt(''), '- - - - - - -');
});

test('answers are marked as Moodle grades them', () => {
  const multi = { multi: true, fractions: [50, 50, -100, 0] };
  assert.equal(answerScore(multi, new Set([0, 1])), 1);
  assert.equal(answerScore(multi, new Set([0])), 0.5);
  assert.equal(answerScore(multi, new Set([0, 2])), 0);
  const single = { multi: false, fractions: [0, 100, 50] };
  assert.equal(answerScore(single, new Set([1])), 1);
  assert.equal(answerScore(single, new Set([2])), 0.5);
  assert.equal(answerScore(single, new Set([1, 2])), 0);
  const items = sheetItems(QUIZ);
  // q0..q5 have their key at i % 4; the true/false answer is false and worth 2.
  const r = markSheet(items, parseTyped('ABCDABF', items));
  assert.deepEqual(r, { score: 8, max: 8, perItem: [1, 1, 1, 1, 1, 1, 2] });
});

test('a perspective transform maps the four corners and keeps straight lines straight', () => {
  const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
  const to = [{ x: 30, y: 20 }, { x: 410, y: 60 }, { x: 380, y: 700 }, { x: 10, y: 650 }];
  const map = homography(from, to);
  from.forEach((p, i) => {
    const q = map(p);
    assert.ok(Math.abs(q.x - to[i].x) < 1e-6 && Math.abs(q.y - to[i].y) < 1e-6);
  });
  const [a, m, b] = [map({ x: 0, y: 0 }), map({ x: 50, y: 100 }), map({ x: 100, y: 200 })];
  assert.ok(Math.abs((m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)) < 1e-6);
});

test('automatic uploads replace each other for an hour, and never a version uploaded by hand', () => {
  const now = 10 * AUTO_SESSION;
  assert.equal(replacesVersion({ auto: true, since: now - 1000 }, true, now), true);
  assert.equal(replacesVersion({ auto: true, since: now - AUTO_SESSION }, true, now), false);
  assert.equal(replacesVersion({ uploaded: now - 1000 }, true, now), false);
  assert.equal(replacesVersion({ auto: true, since: now - 1000 }, false, now), false);
  assert.equal(replacesVersion({ auto: true, since: now - 1000, deleted: 1 }, true, now), false);
  assert.equal(replacesVersion(null, true, now), false);
});
