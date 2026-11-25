// Right-click menus for questions, in the editor and in the question list. One menu is shown at a time, by App.

import { Plus, Copy, ImageDown, Images, Trash,CircleCheck, CircleDot, WandSparkles, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine, ArrowUpDown, Upload, SquarePen, FolderInput, ChevronLeft, ChevronRight, Eye, EyeOff, Presentation, Eraser } from '@lucide/svelte';
import { app, select, openModal, duplicateQuestion, deleteQuestion, moveQuestion, setReviewed, markReviewed, goToQuestion, deleteChecked, duplicateChecked, moveChecked, notify } from './store.svelte.js';
import { htmlClutter, cleanQuestionsHtml } from './cleanhtml.js';
import { IMAGE_FORMATS, imageExt, canWrite, questionImages, isReadable, exportImage, exportImages, copyImage } from './questionimages.js';

const cleaned = (n) => notify(`Removed the extra HTML from ${n} question${n === 1 ? '' : 's'}. Undo with Ctrl+Z.`, 'success', 4000);

/** The open menu: { x, y, items }, or null. */
export const contextMenu = $state({ open: null });

const inText = (e) => !!e.target.closest?.('input, select, textarea, [contenteditable="true"], .ProseMirror');

// ---------------------------------------------------------------- images

const isWeb = (src) => /^https?:/i.test(src);

async function saveImage(q, src, format) {
  try {
    await exportImage(q, src, format);
  } catch (e) {
    if (e.convert) return notify(`Could not convert this image to ${IMAGE_FORMATS[format]}. Export it in its original format instead.`, 'error', 6000);
    const open = { label: 'Open it', run: () => window.open(src, '_blank', 'noopener') };
    notify(isWeb(src) ? 'This image is on a website that does not let Moodler read it. Open it to save it from there.' : 'Could not read this image.', 'error', 8000, isWeb(src) ? open : null);
  }
}

async function saveImages(q, format) {
  const images = questionImages(q);
  if (images.length === 1) return saveImage(q, images[0].src, format);
  const { saved, failed } = await exportImages(q, format);
  if (!failed) return;
  const result = saved ? `Exported ${saved} of ${saved + failed} images. The rest` : 'Could not export the images. They';
  notify(`${result} could not be read${format ? ' or converted' : ''}, usually because the website they are on does not allow it.`, saved ? 'warning' : 'error', 8000);
}

async function copy(src) {
  try {
    await copyImage(src);
    notify('Image copied.', 'success', 2500);
  } catch {
    notify('Could not copy this image.', 'error');
  }
}

/** The formats to export images in, as menu items: their own first, named when they all have the same one, then those to convert to. */
function formatItems(srcs, save) {
  const exts = [...new Set(srcs.map(imageExt))];
  const own = exts.length === 1 ? exts[0] : '';
  const name = own && (IMAGE_FORMATS[own] ?? own.toUpperCase());
  return [
    { label: name ? `${name} (original)` : srcs.length > 1 ? 'Original formats' : 'Original format', run: () => save('') },
    ...Object.keys(IMAGE_FORMATS)
      .filter((f) => f !== own && canWrite(f))
      .map((f) => ({ label: IMAGE_FORMATS[f], run: () => save(f) })),
  ];
}

/** The actions for the images of a question; `src` is the one that was clicked, if any. */
function imageItems(q, src) {
  const images = questionImages(q);
  const n = images.length;
  return [
    src && { label: 'Export this image', icon: ImageDown, items: formatItems([src], (format) => saveImage(q, src, format)) },
    src && { label: 'Copy this image', icon: Copy, run: () => copy(src) },
    n > (src ? 1 : 0) && { label: n === 1 ? 'Export the image' : `Export all ${n} images`, icon: n === 1 ? ImageDown : Images, items: formatItems(images.map((x) => x.src), (format) => saveImages(q, format)) },
  ].filter(Boolean);
}

/** The menu for a right-click in the editor or the live preview. An image has its own actions, also in the text editors. */
export function showEditorMenu(e, q) {
  const img = e.target.closest?.('img');
  const src = img?.closest('.rendered') ? img.getAttribute('src')?.trim() : '';
  const clicked = isReadable(src) ? src : '';
  if (clicked && inText(e)) return openAt(e, imageItems(q, clicked));
  showMenu(e, questionMenu(q.id, { inEditor: true, image: clicked }));
}

// ---------------------------------------------------------------- menus

/** Opens a menu at the pointer. Text fields and the rich-text editor keep the browser's own menu. */
export function showMenu(e, items) {
  if (!inText(e)) openAt(e, items);
}

function openAt(e, items) {
  if (!items?.length) return;
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  // Opened from the keyboard (the menu key or Shift+F10): under the element.
  if (!x && !y) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.left + 16;
    y = r.top + Math.min(r.height, 28);
  }
  contextMenu.open = { x, y, items };
}

export function closeMenu() {
  contextMenu.open = null;
}

/** The actions for one question. `inEditor` adds going to the previous and next question, `image` those for an image that was clicked. */
export function questionMenu(id, { inEditor = false, image = '' } = {}) {
  const list = app.quiz.questions;
  const i = list.findIndex((q) => q.id === id);
  if (i < 0) return [];
  const q = list[i];
  const last = list.length - 1;
  const move = (to) => () => moveQuestion(i, to);
  const images = imageItems(q, image);
  return [
    ...(image ? [...images, '-'] : []),
    inEditor && { label: 'Previous question', icon: ChevronLeft, disabled: i === 0, run: () => goToQuestion(-1) },
    inEditor && { label: 'Next question', icon: ChevronRight, disabled: i === last, run: () => goToQuestion(1) },
    inEditor && '-',
    { label: 'Add a question after this…', icon: Plus, run: () => (select(id), openModal('add')) },
    { label: 'Duplicate', icon: Copy, run: () => duplicateQuestion(id) },
    !app.quiz.noReview &&
      (q.unreviewed
        ? { label: 'Mark as reviewed', icon: CircleCheck, run: () => (inEditor ? markReviewed(id) : setReviewed(true, [id])) }
        : { label: 'Mark as not reviewed', icon: CircleDot, run: () => setReviewed(false, [id]) }),
    { label: q.hidden ? 'Show in the question bank' : 'Hide in the question bank', icon: q.hidden ? Eye : EyeOff, run: () => (q.hidden = !q.hidden) },
    { label: 'Improve with AI…', icon: WandSparkles, run: () => openModal('ai-question', { id }) },
    { label: 'Remove extra HTML', icon: Eraser, disabled: !htmlClutter(q).length, run: () => cleaned(cleanQuestionsHtml([q])) },
    ...(image ? [] : images),
    inEditor && { label: 'Preview the whole quiz', icon: Presentation, run: () => openModal('quiz-preview') },
    '-',
    {
      label: 'Move',
      icon: ArrowUpDown,
      disabled: last === 0,
      items: [
        { label: 'Up', icon: ArrowUp, hint: 'Alt+↑', disabled: i === 0, run: move(i - 1) },
        { label: 'Down', icon: ArrowDown, hint: 'Alt+↓', disabled: i === last, run: move(i + 1) },
        { label: 'To the top', icon: ArrowUpToLine, disabled: i === 0, run: move(0) },
        { label: 'To the bottom', icon: ArrowDownToLine, disabled: i === last, run: move(last) },
      ],
    },
    '-',
    { label: 'Delete question', icon: Trash, danger: true, run: () => deleteQuestion(id) },
  ].filter(Boolean);
}

/** The actions for the ticked questions in the list. */
export function checkedMenu() {
  const n = app.checked.length;
  const ids = new Set(app.checked);
  const toReview = app.quiz.questions.some((q) => q.unreviewed && ids.has(q.id));
  return [
    { label: `Export ${n} questions…`, icon: Upload, run: () => openModal('export') },
    { label: 'Edit mark, tags, category…', icon: SquarePen, run: () => openModal('bulk') },
    { label: 'Copy or move to another quiz…', icon: FolderInput, run: () => openModal('copy-to') },
    !app.quiz.noReview &&
      (toReview
        ? { label: 'Mark as reviewed', icon: CircleCheck, run: () => setReviewed(true, [...app.checked]) }
        : { label: 'Mark as not reviewed', icon: CircleDot, run: () => setReviewed(false, [...app.checked]) }),
    { label: 'Duplicate', icon: Copy, run: duplicateChecked },
    {
      label: 'Remove extra HTML',
      icon: Eraser,
      disabled: !app.quiz.questions.some((q) => ids.has(q.id) && htmlClutter(q).length),
      run: () => cleaned(cleanQuestionsHtml(app.quiz.questions.filter((q) => ids.has(q.id)))),
    },
    '-',
    {
      label: 'Move',
      icon: ArrowUpDown,
      items: [
        { label: 'To the top', icon: ArrowUpToLine, run: () => moveChecked('top') },
        { label: 'To the bottom', icon: ArrowDownToLine, run: () => moveChecked('bottom') },
      ],
    },
    '-',
    { label: `Delete ${n} questions`, icon: Trash, danger: true, run: deleteChecked },
  ];
}
