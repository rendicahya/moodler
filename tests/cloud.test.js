import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuiz } from '../src/lib/model.js';
import { splitChunks, normalizeFolders, folderPath, childFolders, folderTreeIds, folderOptions, cloudView, daysLeft, quizVersions, searchText, matchQuiz, foldText, reviewCounts, TRASH_DAYS } from '../src/lib/cloud.js';
import { fitSize } from '../src/lib/images.js';

const DAY = 24 * 60 * 60 * 1000;

test('the trash holds what was deleted itself, and hides what is inside a deleted folder', () => {
  const folders = [
    { id: 'a', name: 'A', parent: null, deleted: 2000 },
    { id: 'b', name: 'B', parent: 'a' },
    { id: 'c', name: 'C', parent: null },
  ];
  const quizzes = [
    { id: 'q1', name: 'In B', folder: 'b' },
    { id: 'q2', name: 'Deleted', folder: 'c', deleted: 3000 },
    { id: 'q3', name: 'Live', folder: 'c' },
    { id: 'q4', name: 'Lost folder', folder: 'gone' },
  ];
  const v = cloudView(folders, quizzes);
  assert.deepEqual(v.folders.map((f) => f.id), ['c']);
  assert.deepEqual(v.quizzes.map((q) => [q.id, q.folder]), [['q3', 'c'], ['q4', null]]);
  assert.deepEqual(v.trash.map((t) => [t.kind, t.id, t.from]), [['quiz', 'q2', 'c'], ['folder', 'a', null]]);
  const a = v.trash[1];
  assert.deepEqual(a.folderIds.sort(), ['a', 'b']);
  assert.deepEqual(a.quizzes.map((q) => q.id), ['q1']);
});

test('trash entries count down to being deleted for good', () => {
  const now = 100 * DAY;
  assert.equal(daysLeft(now, now), TRASH_DAYS);
  assert.equal(daysLeft(now - (TRASH_DAYS - 1) * DAY - 1, now), 1);
  assert.ok(daysLeft(now - TRASH_DAYS * DAY, now) <= 0);
});

test('the versions of a quiz are the current upload, then the earlier ones', () => {
  const meta = { version: 'v3', chunks: 1, size: 10, count: 2, uploaded: 3, name: 'Q', history: [{ version: 'v2' }, { version: 'v1' }] };
  assert.deepEqual(quizVersions(meta).map((v) => v.version), ['v3', 'v2', 'v1']);
  assert.deepEqual(quizVersions({ ...meta, history: undefined }).map((v) => v.version), ['v3']);
});

test('search finds a quiz by its name, or by words that are all in one question', () => {
  const quiz = {
    questions: [
      { name: '', questiontext: '<p>What is the capital of <b>France</b>?</p>', answers: [{ text: 'Paris' }, { text: 'Lyon' }] },
      { name: 'Rivers', questiontext: 'Which river flows through Cairo?', answers: [{ text: 'Nile' }] },
    ],
  };
  const text = searchText(quiz);
  assert.equal(text.split('\n').filter(Boolean).length, 2);
  assert.equal(matchQuiz('Geography', text, 'capital paris').questions.length, 1);
  assert.equal(matchQuiz('Geography', text, 'paris nile'), null);
  assert.equal(matchQuiz('Geography', text, 'geo').byName, true);
  assert.equal(matchQuiz('Géographie', '', 'geographie').byName, true);
  assert.equal(matchQuiz('Quiz', text, 'NILE').questions[0].title, 'Rivers');
  // An unnamed question is titled by its text, so only the excerpt is shown.
  const unnamed = matchQuiz('Quiz', text, 'france').questions[0];
  assert.equal(unnamed.title, '');
  assert.match(unnamed.excerpt, /capital of France/);
  assert.equal(matchQuiz('Quiz', text, '   '), null);
});

test('search text stays small enough for a Firestore document', () => {
  const long = { questions: Array.from({ length: 2000 }, (_, n) => ({ name: '', questiontext: `Question ${n} ` + 'word '.repeat(1000) })) };
  const text = searchText(long);
  assert.ok(text.length <= 300_000);
  assert.ok(text.isWellFormed());
  assert.equal(foldText('  Ünïcode   Text '), 'unicode text');
});

test('images are scaled down to fit, keeping their shape, and small ones are left alone', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(1000, 3200), { width: 500, height: 1600 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

// a / b / c, and d at the top level
const TREE = [
  { id: 'c', name: 'C', parent: 'b' },
  { id: 'a', name: 'A', parent: null },
  { id: 'd', name: 'D', parent: null },
  { id: 'b', name: 'B', parent: 'a' },
];

test('a folder path runs from the top level down', () => {
  assert.deepEqual(folderPath(TREE, 'c').map((f) => f.id), ['a', 'b', 'c']);
  assert.deepEqual(folderPath(TREE, null), []);
});

test('child folders are sorted by name, with natural number order', () => {
  const folders = [{ id: '1', name: 'Week 10', parent: null }, { id: '2', name: 'week 2', parent: null }, { id: '3', name: 'Inner', parent: '1' }];
  assert.deepEqual(childFolders(folders, null).map((f) => f.id), ['2', '1']);
  assert.deepEqual(childFolders(folders, '1').map((f) => f.id), ['3']);
});

test('a folder tree holds the folder and everything below it', () => {
  assert.deepEqual(folderTreeIds(TREE, 'a').sort(), ['a', 'b', 'c']);
  assert.deepEqual(folderTreeIds(TREE, 'd'), ['d']);
});

test('move targets are in tree order and never the moved folder or anything below it', () => {
  assert.deepEqual(folderOptions(TREE).map((o) => [o.id, o.depth]), [['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
  assert.deepEqual(folderOptions(TREE, 'b').map((o) => o.id), ['a', 'd']);
});

test('the tree hides what is below a collapsed folder and says which folders can open', () => {
  const rows = folderOptions(TREE, null, (id) => id === 'a');
  assert.deepEqual(rows.map((o) => [o.id, o.parent, o.hasChildren]), [['a', null, true], ['b', 'a', true], ['d', null, false]]);
});

test('folders with a missing parent or in a loop go to the top level', () => {
  const fixed = normalizeFolders([
    { id: 'ok', name: 'Ok' },
    { id: 'under', name: 'Under', parent: 'ok' },
    { id: 'lost', name: 'Lost', parent: 'gone' },
    { id: 'x', name: 'X', parent: 'y' },
    { id: 'y', name: 'Y', parent: 'x' },
    { id: 'self', name: 'Self', parent: 'self' },
  ]);
  const parents = Object.fromEntries(fixed.map((f) => [f.id, f.parent]));
  assert.deepEqual(parents, { ok: null, under: 'ok', lost: null, x: null, y: null, self: null });
});

const MIB = 1024 * 1024;

test('chunks join back into the same text', () => {
  const text = 'abc'.repeat(1000);
  const chunks = splitChunks(text, 700);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((c) => c.length <= 700));
});

test('empty text has no chunks', () => {
  assert.deepEqual(splitChunks(''), []);
});

test('a surrogate pair is never split, so every chunk is valid text', () => {
  const text = '😀'.repeat(50);
  for (const size of [2, 3, 5, 7]) {
    const chunks = splitChunks(text, size);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((c) => c.isWellFormed()));
  }
});

test('default chunks fit in a Firestore document, even with the widest characters', () => {
  const text = '語'.repeat(1_000_000);
  const chunks = splitChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((c) => Buffer.byteLength(c) < MIB - 1024));
});

test('a quiz that does not need review drops its review marks', () => {
  const quiz = normalizeQuiz({ noReview: true, questions: [{ type: 'truefalse', unreviewed: true }, { type: 'truefalse', reviewed: true }] });
  assert.equal(quiz.questions.some((q) => q.unreviewed || q.reviewed), false);
  assert.equal(reviewCounts(quiz), null);
  assert.equal('noReview' in normalizeQuiz({ noReview: false, questions: [] }), false);
});

test('review counts of a quiz', () => {
  assert.equal(reviewCounts({ questions: [{}, {}] }), null);
  assert.deepEqual(reviewCounts({ questions: [{ unreviewed: true }, {}, { reviewed: true }] }), { done: 2, todo: 1 });
  assert.deepEqual(reviewCounts({ questions: [{ reviewed: true }, {}] }), { done: 2, todo: 0 });
});