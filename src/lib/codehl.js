// Syntax highlighting for code blocks in question text.
// Moodle shows question HTML without any highlighting stylesheet, so the colours are written into the HTML as inline
// styles. Each coloured span also keeps its highlight.js class, which lets the app redraw it in dark-mode colours.

export const LANGUAGES = [
  { id: 'plaintext', label: 'Plain text' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'go', label: 'Go' },
  { id: 'xml', label: 'HTML / XML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'matlab', label: 'MATLAB' },
  { id: 'php', label: 'PHP' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
];

const LOADERS = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  go: () => import('highlight.js/lib/languages/go'),
  xml: () => import('highlight.js/lib/languages/xml'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
};

// Light colours, as students see them in Moodle (based on GitHub's light theme).
export const COLORS = {
  keyword: '#cf222e',
  doctag: '#cf222e',
  'template-tag': '#cf222e',
  'template-variable': '#cf222e',
  type: '#cf222e',
  title: '#8250df',
  attr: '#0550ae',
  attribute: '#0550ae',
  literal: '#0550ae',
  meta: '#0550ae',
  number: '#0550ae',
  operator: '#0550ae',
  variable: '#0550ae',
  'selector-attr': '#0550ae',
  'selector-class': '#0550ae',
  'selector-id': '#0550ae',
  section: '#0550ae',
  regexp: '#0a3069',
  string: '#0a3069',
  built_in: '#953800',
  symbol: '#953800',
  bullet: '#953800',
  comment: '#6e7781',
  code: '#6e7781',
  formula: '#6e7781',
  name: '#116329',
  quote: '#116329',
  'selector-tag': '#116329',
  'selector-pseudo': '#116329',
  addition: '#116329',
  deletion: '#82071e',
};
const ITALIC = new Set(['comment', 'quote']);

export const BLOCK_STYLE =
  "background-color:#f6f8fa;color:#1f2328;padding:10px 12px;border-radius:6px;font-family:Consolas,Menlo,'Courier New',monospace;font-size:0.9em;line-height:1.45;white-space:pre-wrap;";

let core;
const loaded = new Set();

async function highlighter(lang) {
  if (!core) core = (await import('highlight.js/lib/core')).default;
  if (LOADERS[lang] && !loaded.has(lang)) {
    core.registerLanguage(lang, (await LOADERS[lang]()).default);
    loaded.add(lang);
  }
  return core;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Turns highlight.js's class-only spans into spans with inline colours.
export function inlineStyles(html) {
  return html.replace(/<span class="([^"]*)">/g, (whole, classes) => {
    const scope = classes.split(' ').find((c) => c.startsWith('hljs-'));
    if (!scope) return '<span>';
    const name = scope.slice(5);
    const color = COLORS[name];
    if (!color) return `<span class="${scope}">`;
    return `<span class="${scope}" style="color:${color};${ITALIC.has(name) ? 'font-style:italic;' : ''}">`;
  });
}

// The HTML of a highlighted code block.
export async function codeBlockHtml(code, lang) {
  const text = code.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  let body = escapeHtml(text);
  if (LOADERS[lang]) {
    const hljs = await highlighter(lang);
    body = inlineStyles(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value);
  }
  const cls = LOADERS[lang] ? lang : 'plaintext';
  return `<pre style="${BLOCK_STYLE}"><code class="language-${cls}">${body}</code></pre>`;
}

// Reads the code and language back out of a <pre> element in the editor.
export function readCodeBlock(pre) {
  const copy = pre.cloneNode(true);
  for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
  const tagged = [pre, ...pre.querySelectorAll('code')].map((e) => /\blanguage-([\w+#-]+)/.exec(e.className)?.[1]).find(Boolean);
  const lang = tagged && LANGUAGES.some((l) => l.id === tagged) ? tagged : null;
  return { code: copy.textContent.replace(/\n+$/, ''), lang };
}
