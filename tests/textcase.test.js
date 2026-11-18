import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseText } from '../src/lib/textcase.js';

test('upper and lower case', () => {
  assert.equal(caseText('Hello World', 'upper'), 'HELLO WORLD');
  assert.equal(caseText('Hello World', 'lower'), 'hello world');
});

test('capitalize each word', () => {
  assert.equal(caseText("the CELL's nucleus-wall", 'title'), "The Cell's Nucleus-Wall");
  // In the middle of a word, the next letter stays small.
  assert.equal(caseText('LLO', 'title', 'he'), 'llo');
});

test('sentence case', () => {
  assert.equal(caseText('THE SKY IS BLUE. IS IT? YES!  OK', 'sentence'), 'The sky is blue. Is it? Yes!  Ok');
  assert.equal(caseText('WORLD', 'sentence', 'hello '), 'world');
  assert.equal(caseText('WORLD', 'sentence', 'Hello. '), 'World');
  assert.equal(caseText('3.5 KG', 'sentence'), '3.5 kg');
});
