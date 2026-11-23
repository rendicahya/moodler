// Right-click menus for questions, in the editor and in the question list. One menu is shown at a time, by App.

import { Plus, Copy, Trash, CircleCheck, CircleDot, WandSparkles, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine, Upload, SquarePen, FolderInput, ChevronLeft, ChevronRight, Eye, EyeOff, Presentation } from '@lucide/svelte';
import { Eraser } from '@lucide/svelte';
import { app, select, openModal, duplicateQuestion, deleteQuestion, moveQuestion, setReviewed, markReviewed, goToQuestion, deleteChecked, duplicateChecked, moveChecked, notify } from './store.svelte.js';
import { htmlClutter, cleanQuestionsHtml } from './cleanhtml.js';

const cleaned = (n) => notify(`Removed the extra HTML from ${n} question${n === 1 ? '' : 's'}. Undo with Ctrl+Z.`, 'success', 4000);

/** The open menu: { x, y, items }, or null. */
export const contextMenu = $state({ open: null });

/** Opens a menu at the pointer. Text fields and the rich-text editor keep the browser's own menu. */
export function showMenu(e, items) {
  if (e.target.closest?.('input, select, textarea, [contenteditable="true"], .ProseMirror')) return;
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

/** The actions for one question. `inEditor` adds going to the previous and next question. */
export function questionMenu(id, { inEditor = false } = {}) {
  const list = app.quiz.questions;
  const i = list.findIndex((q) => q.id === id);
  if (i < 0) return [];
  const q = list[i];
  const last = list.length - 1;
  const move = (to) => () => moveQuestion(i, to);
  return [
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
    inEditor && { label: 'Preview the whole quiz', icon: Presentation, run: () => openModal('quiz-preview') },
    '-',
    { label: 'Move up', icon: ArrowUp, disabled: i === 0, run: move(i - 1) },
    { label: 'Move down', icon: ArrowDown, disabled: i === last, run: move(i + 1) },
    { label: 'Move to the top', icon: ArrowUpToLine, disabled: i === 0, run: move(0) },
    { label: 'Move to the bottom', icon: ArrowDownToLine, disabled: i === last, run: move(last) },
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
    { label: 'Move to the top', icon: ArrowUpToLine, run: () => moveChecked('top') },
    { label: 'Move to the bottom', icon: ArrowDownToLine, run: () => moveChecked('bottom') },
    '-',
    { label: `Delete ${n} questions`, icon: Trash, danger: true, run: deleteChecked },
  ];
}
