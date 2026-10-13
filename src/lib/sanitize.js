// Removes active content (scripts, event handlers, javascript: URLs) from HTML before it is rendered.
// Content is otherwise preserved so that it can be exported unchanged.

const BLOCKED_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);

export function sanitizeHtml(html) {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node) => {
    for (const el of [...node.children]) {
      if (BLOCKED_TAGS.has(el.tagName)) {
        el.remove();
        continue;
      }
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
      walk(el);
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
