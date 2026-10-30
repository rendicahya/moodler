import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, tryEvaluate, syncDatasets, wildcardNames, substitute, formatAnswer } from '../src/lib/calc.js';
import { createQuestion, normalizeQuestion, validateQuestion } from '../src/lib/model.js';
import { exportMoodleXml, importMoodleXml } from '../src/lib/formats/moodlexml.js';
import { buildImprovePrompt, readReply, tasksFor } from '../src/lib/improve.js';
import { buildPrompt } from '../src/lib/prompt.js';

test('formulas evaluate like Moodle', () => {
  assert.equal(evaluate('{a} * {b}', { a: 2, b: 3.5 }), 7);
  assert.equal(evaluate('-{a}**2', { a: 3 }), -9);
  assert.equal(evaluate('2 ** 3 ** 2'), 512);
  assert.equal(evaluate('sqrt(16) + pow(2, 3) - abs(-1)'), 11);
  assert.equal(evaluate('round(pi(), 2)'), 3.14);
  assert.equal(evaluate('7 % 3 + max(1, 5, 2)'), 6);
  assert.equal(evaluate('1.5e2 / (2 + 1)'), 50);
  assert.equal(evaluate('{a} - -{b}', { a: 1, b: -2 }), -1);
  assert.match(tryEvaluate('{a} + ', { a: 1 }).error, /ends too early/);
  assert.match(tryEvaluate('foo(1)').error, /Unknown function/);
  assert.match(tryEvaluate('{x} * 2', {}).error, /\{x\} has no value/);
  assert.match(tryEvaluate('1 / 0').error, /not a number/);
  assert.match(tryEvaluate('pow(2)').error, /takes 2 arguments/);
  assert.match(tryEvaluate('(1 + 2').error, /Expected "\)"/);
});

test('datasets follow the wildcards', () => {
  const q = createQuestion('calculated');
  assert.deepEqual(wildcardNames(q), ['a', 'b']);
  assert.deepEqual(q.datasets.map((d) => d.name), ['a', 'b']);
  assert.ok(q.datasets.every((d) => d.items.length === 10 && d.items.every((v) => v >= 1 && v <= 10)));
  assert.equal(syncDatasets(q), false);
  q.answers[0].text = '{a} * {c}';
  q.questiontext = '<p>{a} and {c}</p>';
  assert.equal(syncDatasets(q), true);
  assert.deepEqual(q.datasets.map((d) => d.name), ['a', 'c']);
  q.itemcount = 3;
  syncDatasets(q);
  assert.ok(q.datasets.every((d) => d.items.length === 3));
  assert.deepEqual(validateQuestion(q), []);
  q.answers[0].text = '{a} *';
  assert.match(validateQuestion(q)[0], /Answer formula 1/);
});

test('text substitution and answer display', () => {
  const q = { datasets: [{ name: 'a', items: [2.5] }, { name: 'b', items: [4] }] };
  assert.equal(substitute('<p>{a} × {b} = {={a} * {b}}, not {1:SA:=x}</p>', q), '<p>2.5 × 4 = 10, not {1:SA:=x}</p>');
  assert.equal(formatAnswer(10, 1, 2), '10.00');
  assert.equal(formatAnswer(1234.5, 2, 3), '1.23e+3');
  assert.equal(formatAnswer(0.012345, 2, 2), '0.012');
});

test('calculated questions round-trip through Moodle XML', () => {
  const q = createQuestion('calculated');
  q.name = 'Area';
  q.units = [{ id: 'u', unit: 'm²', multiplier: 1 }];
  const { text, warnings } = exportMoodleXml({ includeCategory: false }, [q]);
  assert.deepEqual(warnings, []);
  assert.match(text, /<question type="calculated">/);
  assert.match(text, /<dataset_item>\s*<number>10<\/number>/);
  const back = normalizeQuestion(importMoodleXml(text).questions[0]);
  assert.equal(back.type, 'calculated');
  assert.equal(back.answers[0].text, '{a} * {b}');
  assert.equal(back.answers[0].tolerancetype, 1);
  assert.equal(back.units[0].unit, 'm²');
  assert.deepEqual(back.datasets.map((d) => d.items), q.datasets.map((d) => d.items));

  // calculatedsimple keeps its kind; definitions without values (as an AI writes them) get values.
  const simple = `<quiz><question type="calculatedsimple"><name><text>S</text></name><questiontext format="html"><text>{x} + 1?</text></questiontext>
    <answer fraction="100"><text>{x} + 1</text><tolerance>0.1</tolerance></answer>
    <dataset_definitions><dataset_definition><status><text>private</text></status><name><text>x</text></name><type>calculated</type>
    <distribution><text>uniform</text></distribution><minimum><text>5</text></minimum><maximum><text>9</text></maximum><decimals><text>0</text></decimals>
    </dataset_definition></dataset_definitions></question></quiz>`;
  const s = normalizeQuestion(importMoodleXml(simple).questions[0]);
  assert.equal(s.variant, 'calculatedsimple');
  assert.equal(s.datasets[0].items.length, 10);
  assert.ok(s.datasets[0].items.every((v) => Number.isInteger(v) && v >= 5 && v <= 9));
  assert.match(exportMoodleXml({ includeCategory: false }, [s]).text, /<question type="calculatedsimple">/);
  assert.match(buildPrompt({ topic: 'Speed', counts: { calculated: 2 } }), /<dataset_definition>/);
});

test('improve prompt sends the question without its images and reads the reply back', () => {
  const q = createQuestion('multichoice');
  q.questiontext = '<p>Which animal is this? <img src="data:image/png;base64,AAAA"></p>';
  q.answers[0].text = 'Cat';
  q.answers[1].text = 'Dog';
  const { prompt, images } = buildImprovePrompt({ q, task: 'translate', language: 'Indonesian' });
  assert.match(prompt, /Translate the question into Indonesian/);
  assert.doesNotMatch(prompt, /base64/);
  assert.match(prompt, /@@PLUGINFILE@@\/image1\.png/);
  assert.doesNotMatch(prompt, /same language as the original/);
  assert.deepEqual(images, { 'image1.png': 'data:image/png;base64,AAAA' });

  const reply = 'Changes:\n- Translated.\n```xml\n<?xml version="1.0"?><quiz><question type="multichoice"><name><text>Hewan</text></name><questiontext format="html"><text><![CDATA[<p>Hewan apa ini? <img src="@@PLUGINFILE@@/image1.png"></p>]]></text></questiontext><single>true</single><answer fraction="100"><text>Kucing</text></answer><answer fraction="0"><text>Anjing</text></answer></question></quiz>\n```';
  const { questions } = readReply(reply, images);
  assert.equal(questions.length, 1);
  assert.match(questions[0].questiontext, /src="data:image\/png;base64,AAAA"/);
  assert.throws(() => readReply('Sorry, I cannot help.'), /No Moodle XML/);

  const v = buildImprovePrompt({ q, task: 'variants', count: 3 }).prompt;
  assert.match(v, /Write 3 new questions/);
  assert.match(v, /containing only the 3 new questions/);
  assert.ok(tasksFor('essay').every((t) => t.id !== 'distractors'));
  assert.ok(tasksFor('multichoice').some((t) => t.id === 'distractors'));
});
