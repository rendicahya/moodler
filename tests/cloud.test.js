import test from 'node:test';
import assert from 'node:assert/strict';
import { splitChunks, normalizeFolders, folderPath, childFolders, folderTreeIds, folderOptions } from '../src/lib/cloud.js';

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
