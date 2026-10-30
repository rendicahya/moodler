import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XML_EXAMPLES, PROMPT_TYPES, buildPrompt } from '../src/lib/prompt.js';
import { importMoodleXml } from '../src/lib/formats/moodlexml.js';
import { detectFormat } from '../src/lib/formats/index.js';

const wrap = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${body}\n</quiz>`;

test('every example in the prompt imports cleanly as its type', () => {
  for (const [key, xml] of Object.entries(XML_EXAMPLES)) {
    const { questions, warnings } = importMoodleXml(wrap(xml));
    assert.deepEqual(warnings, [], key);
    assert.equal(questions.length, 1, key);
    assert.equal(questions[0].type, key === 'multiresponse' ? 'multichoice' : key, key);
    assert.ok(questions[0].name, key);
  }
  const [mc] = importMoodleXml(wrap(XML_EXAMPLES.multichoice)).questions;
  assert.equal(mc.single, true);
  assert.equal(mc.answers.filter((a) => a.fraction === 100).length, 1);
  const [ord] = importMoodleXml(wrap(XML_EXAMPLES.ordering)).questions;
  assert.deepEqual(ord.items.map((i) => i.text), ['Mercury', 'Venus', 'Earth', 'Mars']);
  const [tf] = importMoodleXml(wrap(XML_EXAMPLES.truefalse)).questions;
  assert.equal(tf.correct, true);
});

test('the prompt asks for the chosen types and counts only', () => {
  const p = buildPrompt({
    topic: 'Photosynthesis',
    counts: { multichoice: 5, truefalse: 2 },
    difficulty: 'medium',
    language: 'Indonesian',
    category: 'Biology & Plants',
    feedback: true,
    material: 'Plants make sugar from light.',
  });
  assert.match(p, /Write 7 quiz questions about: Photosynthesis/);
  assert.match(p, /5 × Multiple choice \(one answer\)/);
  assert.match(p, /2 × True \/ False/);
  assert.doesNotMatch(p, /type="matching"/);
  assert.match(p, /in Indonesian/);
  assert.match(p, /\$course\$\/top\/Biology &amp; Plants/);
  assert.match(p, /Source material:\n"""\nPlants make sugar from light\.\n"""$/);
  assert.equal(PROMPT_TYPES.every((t) => XML_EXAMPLES[t.type]), true);
});

test('AI replies with a code fence or extra text still import as Moodle XML', () => {
  const reply = `Here are your questions:\n\n\`\`\`xml\n${wrap(XML_EXAMPLES.shortanswer)}\n\`\`\`\n\nLet me know if you need more.`;
  assert.equal(detectFormat(reply), 'xml');
  const { questions, warnings } = importMoodleXml(reply);
  assert.deepEqual(warnings, []);
  assert.equal(questions[0].answers[0].text, 'Jupiter');
});
