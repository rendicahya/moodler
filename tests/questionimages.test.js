import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion, newAnswer } from '../src/lib/model.js';
import { questionImages, imageNames, imageExt, fileStem } from '../src/lib/questionimages.js';

const make = (type, fields) => Object.assign(createQuestion(type), fields);
const A = 'data:image/png;base64,AAAA';
const B = 'data:image/gif;base64,BBBB';

test('The images of a question are found in all its texts, each once', () => {
  const q = make('multichoice', {
    questiontext: `<p><img alt="a > b" src="${A}"><img src='https://x.y/p.png?a=1&amp;b=2' data-src="no"><img src="@@PLUGINFILE@@/lost.png"></p>`,
    answers: [newAnswer({ text: `<img src="${A}">` }), newAnswer({ text: 'x', feedback: `<IMG SRC="${B}" ALT="Cat &amp; dog" />` })],
    generalfeedback: '&lt;img src="https://no.no/x.png"&gt;',
  });
  assert.deepEqual(questionImages(q), [
    { src: A, alt: 'a > b' },
    { src: 'https://x.y/p.png?a=1&b=2', alt: '' },
    { src: B, alt: 'Cat & dog' },
  ]);
});

test('Text that is not HTML has no images', () => {
  const tag = '<img src="https://x.y/z.png">';
  assert.deepEqual(questionImages(make('shortanswer', { name: tag, questiontext: tag, questiontextformat: 'plain_text', answers: [newAnswer({ text: tag })] })), []);
});

test('The format of an embedded image is known from its data', () => {
  const svg = 'data:image/svg+xml;utf8,<svg/>';
  assert.deepEqual([A, B, svg, 'data:image/JPG;base64,AA', 'https://x.y/p.png', 'data:image/odd,x'].map(imageExt), ['png', 'gif', 'svg', 'jpg', '', '']);
});

test('Image files are named after their description, or the question, and never the same', () => {
  const names = (alts, title = 'Cells: 1/2?') => imageNames(alts.map((alt) => ({ alt })), title);
  assert.deepEqual(names(['']), ['Cells 1 2']);
  assert.deepEqual(names(['photo.PNG', 'Photo', '', 'photo.jpg']), ['photo', 'Photo (2)', 'Cells 1 2 3', 'photo (3)']);
  assert.deepEqual(names(['', ''], '???'), ['Image 1', 'Image 2']);
  assert.equal(fileStem('..\\é 漢\n​. '), 'é 漢');
  assert.equal([...fileStem('😀'.repeat(90))].length, 60);
});
