// Removes the clutter that text pasted from Word, Google Docs, web pages and AI chats brings along: Office and
// data-* attributes, generated ids and classes, and inline styles that only repeat the defaults or fix the font
// and spacing (which then fight the Moodle theme). What changes how the text looks on purpose (colours,
// alignment, bold, sizes of pictures and tables) is kept. Works on the HTML string, so it also runs in tests.

import { textFields } from './findreplace.js';

// Properties that set the font family, spacing or Office layout: the Moodle theme should decide these.
const DROP_PROPS = new Set([
  'font-family',
  'line-height',
  'text-indent',
  'white-space',
  'font-feature-settings',
  'font-kerning',
  'font-optical-sizing',
  'font-variant',
  'font-variant-ligatures',
  'font-variant-caps',
  'font-variant-numeric',
  'font-variant-east-asian',
  'font-variant-alternates',
  'font-variant-position',
  'font-stretch',
  'orphans',
  'widows',
  'word-spacing',
  'caret-color',
  'tab-stops',
  'text-autospace',
  'text-size-adjust',
  'overflow-wrap',
  'word-wrap',
  'text-wrap',
  'text-wrap-mode',
  'box-sizing',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-block-start',
  'margin-block-end',
  'margin-inline-start',
  'margin-inline-end',
  'page-break-before',
  'page-break-after',
  'page-break-inside',
  'break-before',
  'break-after',
  'break-inside',
]);

const BLACK = /^(black|windowtext|#000|#000000|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*1\s*)?\))$/;
const WHITE_OR_NONE = /^(transparent|none|white|#fff|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*1\s*)?\)|rgba\(.*,\s*0\s*\))$/;
// Values that only restate what the property is anyway.
const DEFAULTS = {
  'font-weight': /^(normal|400)$/,
  'font-style': /^normal$/,
  'text-decoration': /^none$/,
  'text-decoration-line': /^none$/,
  'vertical-align': /^baseline$/,
  'text-align': /^(left|start)$/,
  'text-transform': /^none$/,
  'letter-spacing': /^(normal|0(px|pt|em)?)$/,
  color: BLACK,
  'background-color': WHITE_OR_NONE,
  background: WHITE_OR_NONE,
  padding: /^(0(px|pt|cm|in|em)?\s*)+$/,
  'padding-top': /^0(px|pt|cm|in|em)?$/,
  'padding-bottom': /^0(px|pt|cm|in|em)?$/,
  'padding-left': /^0(px|pt|cm|in|em)?$/,
  'padding-right': /^0(px|pt|cm|in|em)?$/,
  border: /^(none|0(px|pt)?)$/,
  // The usual body size (11–12pt in Office, 16px on the web): the theme sets it anyway.
  'font-size': /^(medium|100%|1r?em|((10|11|12)(\.0+)?|10\.5)pt|1[3-6](\.\d+)?px)$/,
};
const ANY_DEFAULT = /^(inherit|initial|unset|revert|normal)$/;

/** Splits a style attribute into [prop, value] pairs; semicolons inside url(...) stay where they are. */
const declarations = (style) =>
  style
    .split(/;(?![^(]*\))/)
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const at = d.indexOf(':');
      return at < 0 ? [d.toLowerCase(), ''] : [d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()];
    });

function keepDeclaration(prop, value) {
  if (!value) return false;
  if (/^(mso-|-webkit-|-moz-|-ms-)/.test(prop) || DROP_PROPS.has(prop)) return false;
  const v = value.replace(/\s*!important$/i, '').trim().toLowerCase();
  if (ANY_DEFAULT.test(v)) return false;
  return !DEFAULTS[prop]?.test(v);
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Wrappers that mean nothing without their attributes.
const UNWRAP_BARE = new Set(['span', 'font']);
const STACKED = new Set(['span', 'font', 'b', 'strong']);
const JUNK_CLASS = /^(Mso|mso|Apple-|docs-)/;
const BOOLEAN_JUNK = new Set(['contenteditable', 'spellcheck', 'draggable', 'tabindex', 'translate', 'autocorrect', 'autocapitalize']);

function parseAttrs(src) {
  const out = [];
  for (const m of src.matchAll(ATTR)) out.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] ?? null });
  return out;
}

/** The attributes of one tag that are worth keeping, and whether any were dropped or changed. */
function cleanAttrs(tag, attrs, anchors) {
  let changed = false;
  const kept = [];
  for (const a of attrs) {
    const name = a.name.toLowerCase();
    const value = a.value ?? '';
    let keep = true;
    if (name.startsWith('data-') || name.includes(':') || name === 'xmlns' || name === 'lang' || BOOLEAN_JUNK.has(name)) keep = false;
    else if (name === 'dir') keep = !/^(ltr|auto)$/i.test(value.trim());
    else if (name === 'id') keep = anchors.has(value);
    else if (name === 'face' && tag === 'font') keep = false;
    else if (name === 'class') {
      const classes = value.split(/\s+/).filter(Boolean);
      const rest = classes.filter((c) => !JUNK_CLASS.test(c));
      if (rest.length !== classes.length || !rest.length) {
        changed = true;
        if (rest.length) kept.push({ name: a.name, value: rest.join(' ') });
        continue;
      }
    } else if (name === 'style') {
      const all = declarations(value);
      const rest = all.filter(([p, v]) => keepDeclaration(p, v));
      if (rest.length !== all.length || !rest.length) {
        changed = true;
        if (rest.length) kept.push({ name: a.name, value: rest.map(([p, v]) => `${p}: ${v}`).join('; ') + ';' });
        continue;
      }
    }
    if (keep) kept.push(a);
    else changed = true;
  }
  return { kept, changed };
}

// Values stay as written (entities included); only a double quote from a single-quoted value needs escaping.
const buildTag = (name, attrs, selfClose) =>
  `<${name}${attrs.map((a) => (a.value == null ? ` ${a.name}` : ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)).join('')}${selfClose ? ' /' : ''}>`;

/** The HTML without its clutter; the same string when there is nothing to remove. */
export function cleanHtml(html) {
  if (!html || !html.includes('<')) return html;
  // Ids that a link on the page points to are kept.
  const anchors = new Set([...html.matchAll(/href\s*=\s*["']?#([^"'\s>]+)/gi)].map((m) => m[1]));
  const parts = html.split(/(<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>)/);
  const stack = [];
  let changed = false;
  for (let i = 1; i < parts.length; i += 2) {
    const token = parts[i];
    // Comments: Word's <!--[if gte mso 9]> blocks, <!--StartFragment--> and the like.
    if (token.startsWith('<!--')) {
      parts[i] = '';
      changed = true;
      continue;
    }
    const m = token.match(/^<(\/?)([a-zA-Z][\w:.-]*)([\s\S]*?)(\/?)>$/);
    if (!m) continue;
    const [, closing, rawName, rest, selfClose] = m;
    const name = rawName.toLowerCase();
    // Office tags such as <o:p>: drop the tag, keep what is inside.
    if (name.includes(':')) {
      parts[i] = '';
      changed = true;
      continue;
    }
    if (closing) {
      if (STACKED.has(name)) {
        const at = stack.findLastIndex((s) => s.name === name);
        if (at >= 0) {
          const [open] = stack.splice(at, 1);
          if (open.drop) {
            parts[i] = '';
            changed = true;
          }
        }
      }
      continue;
    }
    const attrs = parseAttrs(rest);
    // Google Docs wraps a whole paste in <b style="font-weight:normal">, which is not bold at all.
    const fakeBold =
      (name === 'b' || name === 'strong') && attrs.some((a) => a.name.toLowerCase() === 'style' && declarations(a.value ?? '').some(([p, v]) => p === 'font-weight' && /^(normal|400)$/i.test(v)));
    const { kept, changed: dropped } = cleanAttrs(name, attrs, anchors);
    const drop = fakeBold || (UNWRAP_BARE.has(name) && !kept.length);
    if (STACKED.has(name) && !selfClose && !VOID.has(name)) stack.push({ name, drop });
    if (drop) {
      parts[i] = '';
      changed = true;
    } else if (dropped) {
      parts[i] = buildTag(rawName, kept, selfClose);
      changed = true;
    }
  }
  return changed ? parts.join('') : html;
}

/** The HTML fields of a question that have clutter to remove: [{ owner, key, label, before, after }]. */
export function htmlClutter(q) {
  const found = [];
  for (const [owner, key, isHtml, label] of textFields(q)) {
    if (!isHtml) continue;
    const before = owner[key];
    const after = cleanHtml(before);
    if (after !== before) found.push({ owner, key, label, before, after });
  }
  return found;
}

/** Removes the clutter from every HTML field of a question; returns how many fields changed. */
export function cleanQuestionHtml(q) {
  const found = htmlClutter(q);
  for (const f of found) f.owner[f.key] = f.after;
  return found.length;
}

/** Removes the clutter from several questions; returns how many of them changed. */
export function cleanQuestionsHtml(questions) {
  return questions.filter((q) => cleanQuestionHtml(q) > 0).length;
}
