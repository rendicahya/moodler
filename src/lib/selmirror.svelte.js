// Text selected in the question editor is highlighted in the live preview, and text selected in the preview is
// highlighted in the editor. Both sides name a piece of text by the same key ("questiontext", "answer:<id>", …) and
// point at the selection by character offsets in its text.

export const mirror = $state({ from: null, key: null, start: 0, end: 0 });

export function setMirror(from, key, start, end) {
  if (mirror.from === from && mirror.key === key && mirror.start === start && mirror.end === end) return;
  Object.assign(mirror, { from, key, start, end });
}

export function clearMirror(from) {
  if (mirror.from === from) mirror.from = null;
}

let owner = null;

/** Takes the highlight away, if `who` put it there. */
export function hideMirror(who) {
  if (owner !== who || typeof CSS === 'undefined' || !CSS.highlights) return;
  CSS.highlights.delete('mq-mirror');
  owner = null;
}

/** Highlights `range` for `who`, and scrolls it into view when it is out of sight. */
export function showMirror(who, range) {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  CSS.highlights.set('mq-mirror', new Highlight(range));
  owner = who;
  const r = range.getBoundingClientRect();
  let box = range.startContainer.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  const view = box?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
  if (r.height && (r.bottom < view.top || r.top > view.bottom)) range.startContainer.parentElement?.scrollIntoView({ block: 'nearest' });
}
