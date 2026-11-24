import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { cssColor, packDocx, xmlText } from '../src/lib/docx.js';
import { parseXml } from '../src/lib/formats/xmlparser.js';

const run = (t, f = {}) => ({ t, f });

test('text is escaped for XML, without characters XML does not allow', () => {
  assert.equal(xmlText('a < b & "c" > d'), 'a &lt; b &amp; &quot;c&quot; &gt; d');
  assert.equal(xmlText('a\u0000b\u000bc\td 😀'), 'abc\td 😀');
});

test('CSS colors become Word colors', () => {
  assert.equal(cssColor('#0a6b2f'), '0A6B2F');
  assert.equal(cssColor('#f00'), 'FF0000');
  assert.equal(cssColor('rgb(255, 0, 16)'), 'FF0010');
  assert.equal(cssColor('inherit'), null);
  assert.equal(cssColor(''), null);
});

test('a .docx file has every part Word needs, and the pictures', () => {
  const bytes = packDocx({
    blocks: [
      { runs: [run('1 < 2', { b: true, color: 'FF0000', vert: 'superscript' }), { tab: true }, { br: true }, { picture: { rId: 'rIdImage1', id: 1, width: 10, height: 20, alt: 'a "b"' } }], p: { left: 567, hanging: 567, keepNext: true } },
      { rows: [[{ col: 0, colSpan: 2, blocks: [] }], [{ col: 0, colSpan: 1, blocks: [{ runs: [run('x')], p: {} }] }, { col: 1, colSpan: 1, merge: 'start', blocks: [] }]], widths: [1000, 2000], left: 0, bordered: true },
    ],
    media: [{ name: 'image1.png', rId: 'rIdImage1', bytes: new Uint8Array([1, 2, 3]) }],
    title: 'Quiz & more',
    paper: 'f4',
  });
  const files = unzipSync(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml', 'word/styles.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png']) assert.ok(files[name], name);
  assert.deepEqual([...files['word/media/image1.png']], [1, 2, 3]);
  const doc = strFromU8(files['word/document.xml']);
  assert.match(doc, /<w:t xml:space="preserve">1 &lt; 2<\/w:t>/);
  assert.match(doc, /<wp:extent cx="95250" cy="190500"\/>/);
  // F4 is 215 × 330 mm.
  assert.match(doc, /<w:pgSz w:w="12189" w:h="18709"\/>/);
  // The text format keeps the order the file format asks for.
  assert.match(doc, /<w:b\/><w:bCs\/><w:color w:val="FF0000"\/><w:vertAlign w:val="superscript"\/>/);
  // A cell always has a paragraph, and spans the width of its columns.
  assert.match(doc, /<w:tcW w:w="3000" w:type="dxa"\/><w:gridSpan w:val="2"\/><\/w:tcPr><w:p\/><\/w:tc>/);
  assert.match(strFromU8(files['docProps/core.xml']), /Quiz &amp; more/);
  assert.equal(parseXml(doc).name ?? '#document', '#document');
});
