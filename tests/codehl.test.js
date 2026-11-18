import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeBlockHtml, inlineStyles, COLORS } from '../src/lib/codehl.js';

test('code blocks carry their colours inline, with the class kept for dark mode', async () => {
  const html = await codeBlockHtml('def f(x):\n    # twice\n    return "a" * 2\n\n', 'python');
  assert.match(html, /^<pre style="[^"]*background-color:#f6f8fa[^"]*"><code class="language-python">/);
  assert.match(html, new RegExp(`<span class="hljs-keyword" style="color:${COLORS.keyword};">def</span>`));
  assert.match(html, /<span class="hljs-comment" style="color:#6e7781;font-style:italic;"># twice<\/span>/);
  assert.match(html, /<span class="hljs-string" style="color:#0a3069;">&quot;a&quot;<\/span>/);
  assert.match(html, /2<\/span><\/code><\/pre>$/, 'trailing blank lines are dropped');
});

test('plain text is escaped and left uncoloured', async () => {
  const html = await codeBlockHtml('a < b && c', 'plaintext');
  assert.equal(html.includes('<code class="language-plaintext">a &lt; b &amp;&amp; c</code>'), true);
  assert.equal(html.includes('<span'), false);
});

test('scopes without a colour keep only their class', () => {
  assert.equal(inlineStyles('<span class="hljs-params">(x)</span>'), '<span class="hljs-params">(x)</span>');
  assert.equal(inlineStyles('<span class="hljs-title function_">f</span>'), `<span class="hljs-title" style="color:${COLORS.title};">f</span>`);
  assert.equal(inlineStyles('<span class="language-xml">x</span>'), '<span>x</span>');
});
