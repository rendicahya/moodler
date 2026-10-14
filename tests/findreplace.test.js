import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion } from '../src/lib/model.js';
import { buildPattern, findInQuestion, replaceInQuestion, snippet } from '../src/lib/findreplace.js';

test('replaces text in HTML fields without touching tags or attributes', () => {
  const q = createQuestion('multichoice');
  q.questiontext = '<p class="cat">The cat &amp; the <b>cat</b>.</p><img src="cat.png" alt="cat">';
  q.answers[0].text = '<p>A cat</p>';
  q.answers[1].feedback = 'Not a cat';
  const re = buildPattern('cat');
  assert.equal(findInQuestion(q, re).count, 4);
  assert.equal(replaceInQuestion(q, re, 'dog & $1'), 4);
  assert.equal(q.questiontext, '<p class="cat">The dog &amp; $1 &amp; the <b>dog &amp; $1</b>.</p><img src="cat.png" alt="cat">');
  assert.equal(q.answers[0].text, '<p>A dog &amp; $1</p>');
  assert.equal(q.answers[1].feedback, 'Not a dog &amp; $1');
});

test('plain fields, case and whole-word options', () => {
  const q = createQuestion('matching');
  q.subquestions[0].answer = 'Cat, cats, CAT';
  assert.equal(findInQuestion(q, buildPattern('cat')).count, 3);
  assert.equal(findInQuestion(q, buildPattern('cat', { wholeWord: true })).count, 2);
  assert.equal(findInQuestion(q, buildPattern('Cat', { matchCase: true, wholeWord: true })).count, 1);
  replaceInQuestion(q, buildPattern('cat', { wholeWord: true }), 'dog');
  assert.equal(q.subquestions[0].answer, 'dog, cats, dog');
});

test('matches entities as the characters they stand for, and leaves grades alone', () => {
  const q = createQuestion('multichoice');
  q.questiontext = '<p>Tom &amp; Jerry</p>';
  q.answers[0].fraction = 100;
  const re = buildPattern('Tom & Jerry');
  assert.equal(findInQuestion(q, re).count, 1);
  assert.deepEqual(snippet(q, re), ['', 'Tom & Jerry', '']);
  assert.equal(findInQuestion(q, buildPattern('100')).count, 0);
});
