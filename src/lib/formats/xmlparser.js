// A small, dependency-free XML parser — enough for Moodle XML. Works in the browser and in Node.

import { decodeEntities } from '../model.js';

/**
 * @typedef {{ name: string, attrs: Record<string,string>, children: XNode[] } | { text: string }} XNode
 */

export function parseXml(src) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const len = src.length;
  const top = () => stack[stack.length - 1];

  while (i < len) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw xmlError('Unterminated comment', src, lt);
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) throw xmlError('Unterminated CDATA section', src, lt);
      top().children.push({ text: src.slice(lt + 9, end), cdata: true });
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw xmlError('Unterminated processing instruction', src, lt);
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) throw xmlError('Unterminated declaration', src, lt);
      i = end + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end === -1) throw xmlError('Unterminated closing tag', src, lt);
      const name = src.slice(lt + 2, end).trim();
      const open = top();
      if (open.name !== name) throw xmlError(`Mismatched closing tag </${name}> (expected </${open.name}>)`, src, lt);
      stack.pop();
      i = end + 1;
    } else {
      // Opening tag: find the closing '>' while respecting quoted attribute values.
      let j = lt + 1;
      let quote = null;
      while (j < len) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= len) throw xmlError('Unterminated tag', src, lt);
      let inner = src.slice(lt + 1, j);
      const selfClosing = inner.endsWith('/');
      if (selfClosing) inner = inner.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(inner);
      if (!m) throw xmlError('Invalid tag', src, lt);
      const node = { name: m[1], attrs: parseAttrs(inner.slice(m[1].length)), children: [] };
      top().children.push(node);
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new Error(`XML error: unclosed element <${top().name}>`);
  return root;

  function pushText(t) {
    if (t) top().children.push({ text: decodeEntities(t) });
  }
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
  return attrs;
}

function xmlError(msg, src, pos) {
  const line = src.slice(0, pos).split('\n').length;
  return new Error(`XML error on line ${line}: ${msg}`);
}

export function child(node, name) {
  return node?.children?.find((c) => c.name === name) ?? null;
}

export function childrenNamed(node, name) {
  return node?.children?.filter((c) => c.name === name) ?? [];
}

/** Returns the textual content of a node; nested elements are re-serialized as markup. */
export function innerText(node) {
  if (!node) return '';
  if ('text' in node) return node.text;
  return node.children.map((c) => ('text' in c ? c.text : serializeNode(c))).join('');
}

function serializeNode(n) {
  if ('text' in n) return n.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join('');
  if (!n.children.length) return `<${n.name}${attrs} />`;
  return `<${n.name}${attrs}>${n.children.map(serializeNode).join('')}</${n.name}>`;
}
