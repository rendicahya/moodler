import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion } from '../src/lib/model.js';
import { cleanHtml, htmlClutter, cleanQuestionHtml } from '../src/lib/cleanhtml.js';

test('leaves clean HTML exactly as it is', () => {
  const html = '<p class="lead">A <strong>bold</strong> <span style="color: red;">word</span></p><img src="a.png" alt="A" width="200">';
  assert.equal(cleanHtml(html), html);
  assert.equal(cleanHtml('x < y and z > w'), 'x < y and z > w');
  assert.equal(cleanHtml(''), '');
});

test('removes Word markup', () => {
  const html =
    '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->' +
    '<p class="MsoNormal" style="margin-bottom:0cm;line-height:normal;mso-pagination:none"><span lang="EN-US" style="font-size:11.0pt;font-family:&quot;Calibri&quot;,sans-serif;color:black">Hello<o:p></o:p></span></p>';
  assert.equal(cleanHtml(html), '<p>Hello</p>');
});

test('removes Google Docs and AI chat attributes', () => {
  const docs =
    '<b style="font-weight:normal;" id="docs-internal-guid-1234"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre-wrap;">Bold</span></p></b>';
  assert.equal(cleanHtml(docs), '<p><span style="font-weight: 700;">Bold</span></p>');
  const chat = '<p data-start="0" data-end="12">Some <strong data-start="5" data-end="9">text</strong></p>';
  assert.equal(cleanHtml(chat), '<p>Some <strong>text</strong></p>');
});

test('keeps styles that matter and ids that links use', () => {
  assert.equal(cleanHtml('<p style="text-align: center; margin: 0;">x</p>'), '<p style="text-align: center;">x</p>');
  assert.equal(cleanHtml('<p dir="rtl" lang="ar">x</p>'), '<p dir="rtl">x</p>');
  assert.equal(cleanHtml('<h3 id="a">A</h3><a href="#a">up</a><p id="b">B</p>'), '<h3 id="a">A</h3><a href="#a">up</a><p>B</p>');
  // Nested spans: only the bare one is unwrapped.
  assert.equal(cleanHtml('<span style="color: red;"><span lang="en">a</span>b</span>'), '<span style="color: red;">ab</span>');
  assert.equal(cleanHtml('<img src="data:image/png;base64,AAA=" alt="x" data-id="3">'), '<img src="data:image/png;base64,AAA=" alt="x">');
  assert.equal(cleanHtml(`<a title='say "hi"' data-x="1" href="u">a</a>`), '<a title="say &quot;hi&quot;" href="u">a</a>');
});

test('finds and cleans the HTML fields of a question only', () => {
  const q = createQuestion('multichoice');
  q.questiontext = '<p dir="ltr" style="text-align: left;">Q</p>';
  q.answers[0].text = '<span lang="en">A</span>';
  q.answers[1].text = 'B';
  q.name = '<span lang="en">name</span>';
  assert.deepEqual(
    htmlClutter(q).map((f) => f.label),
    ['Question text', 'Answer']
  );
  assert.equal(cleanQuestionHtml(q), 2);
  assert.equal(q.questiontext, '<p>Q</p>');
  assert.equal(q.answers[0].text, 'A');
  assert.equal(q.name, '<span lang="en">name</span>');
  assert.equal(htmlClutter(q).length, 0);
});
