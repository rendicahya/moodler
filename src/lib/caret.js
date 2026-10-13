// Remembers the last caret position inside a rich-text editor so dialogs can insert text there.

let last = { el: null, range: null };

export function rememberCaret(el) {
  const sel = getSelection();
  if (sel.rangeCount && el.contains(sel.anchorNode)) last = { el, range: sel.getRangeAt(0).cloneRange() };
}

/** Inserts plain text at the remembered caret in the editor with the given id. Returns false if not possible. */
export function insertAtCaret(editorId, text) {
  const el = document.getElementById(editorId);
  if (!el || el.getAttribute('contenteditable') !== 'true' || last.el !== el || !el.isConnected) return false;
  const range = last.range;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
