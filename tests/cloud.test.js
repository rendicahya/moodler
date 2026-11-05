import test from 'node:test';
import assert from 'node:assert/strict';
import { splitChunks } from '../src/lib/cloud.js';

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
