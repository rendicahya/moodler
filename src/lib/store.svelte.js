import { createQuiz, normalizeQuiz, normalizeQuestion, createQuestion, cloneQuestion, moveItem, questionTitle } from './model.js';

const STORAGE_KEY = 'mqe.quiz.v1';
const THEME_KEY = 'mqe.theme';
const LAYOUT_KEY = 'mqe.layout';
const HISTORY_LIMIT = 200;

function loadQuiz() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeQuiz(JSON.parse(raw));
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return createQuiz();
}

function loadLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (l) return { showPreview: l.showPreview !== false, splitRatio: Math.min(0.75, Math.max(0.25, Number(l.splitRatio) || 0.55)) };
  } catch {
    /* fall through to defaults */
  }
  return { showPreview: true, splitRatio: 0.55 };
}

const layout = loadLayout();

export const app = $state({
  quiz: loadQuiz(),
  selectedId: null,
  // Narrow screens switch between edit and preview; wide screens show both side by side.
  tab: 'edit',
  wide: true,
  showPreview: layout.showPreview,
  splitRatio: layout.splitRatio,
  theme: document.documentElement.dataset.theme || 'light',
  search: '',
  modal: null,
  modalProps: {},
  toasts: [],
  confirm: null,
  sidebarOpen: true,
});

if (app.quiz.questions.length) app.selectedId = app.quiz.questions[0].id;

export const history = $state({ canUndo: false, canRedo: false, savedAt: null });

// ---------------------------------------------------------------- persistence & undo

let past = [];
let future = [];
let current = JSON.stringify(app.quiz);
let timer = null;

function save(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
    history.savedAt = new Date();
  } catch {
    notify('Could not save to browser storage (it may be full). Export your quiz to keep your work.', 'error');
  }
}

function updateFlags() {
  history.canUndo = past.length > 0;
  history.canRedo = future.length > 0;
}

function commit(snapshot) {
  clearTimeout(timer);
  timer = null;
  if (snapshot === current) return;
  past.push(current);
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
  current = snapshot;
  save(snapshot);
  updateFlags();
}

/** Tracks every change to the quiz; changes are grouped into undo steps after a short pause. */
export function initPersistence() {
  $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify(app.quiz);
      clearTimeout(timer);
      timer = setTimeout(() => commit(snapshot), 350);
    });
  });
  window.addEventListener('beforeunload', () => timer && commit(JSON.stringify($state.snapshot(app.quiz))));
}

function restore(snapshot) {
  current = snapshot;
  app.quiz = JSON.parse(snapshot);
  if (!app.quiz.questions.some((q) => q.id === app.selectedId)) app.selectedId = app.quiz.questions[0]?.id ?? null;
  save(snapshot);
  updateFlags();
}

export function undo() {
  commit(JSON.stringify($state.snapshot(app.quiz)));
  if (!past.length) return;
  future.push(current);
  restore(past.pop());
}

export function redo() {
  commit(JSON.stringify($state.snapshot(app.quiz)));
  if (!future.length) return;
  past.push(current);
  restore(future.pop());
}

// ---------------------------------------------------------------- theme

export function setTheme(theme) {
  app.theme = theme;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export const toggleTheme = () => setTheme(app.theme === 'dark' ? 'light' : 'dark');

export function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ showPreview: app.showPreview, splitRatio: app.splitRatio }));
  } catch {
    /* ignore */
  }
}

/** Shows or hides the preview pane on wide screens, or switches between edit and preview on narrow ones. */
export function togglePreview() {
  if (app.wide) {
    app.showPreview = !app.showPreview;
    saveLayout();
  } else {
    app.tab = app.tab === 'edit' ? 'preview' : 'edit';
  }
}

// ---------------------------------------------------------------- notifications & dialogs

let toastId = 0;
export function notify(message, kind = 'info', timeout = 4000) {
  const id = ++toastId;
  app.toasts.push({ id, message, kind });
  if (timeout) setTimeout(() => dismissToast(id), timeout);
}

export function dismissToast(id) {
  const i = app.toasts.findIndex((t) => t.id === id);
  if (i !== -1) app.toasts.splice(i, 1);
}

export function openModal(name, props = {}) {
  app.modal = name;
  app.modalProps = props;
}

export function closeModal() {
  app.modal = null;
  app.modalProps = {};
}

/** Shows a confirmation dialog; resolves to true when confirmed. */
export function ask({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    app.confirm = {
      title,
      message,
      confirmLabel,
      danger,
      resolve: (v) => {
        app.confirm = null;
        resolve(v);
      },
    };
  });
}

// ---------------------------------------------------------------- quiz operations

export const selectedQuestion = () => app.quiz.questions.find((q) => q.id === app.selectedId) ?? null;
export const selectedIndex = () => app.quiz.questions.findIndex((q) => q.id === app.selectedId);

export function select(id) {
  app.selectedId = id;
}

export function addQuestion(type, at = selectedIndex() + 1 || app.quiz.questions.length) {
  const q = createQuestion(type, app.quiz.defaults);
  app.quiz.questions.splice(at, 0, q);
  app.selectedId = q.id;
  app.tab = 'edit';
  app.search = '';
  return q;
}

export function duplicateQuestion(id) {
  const i = app.quiz.questions.findIndex((q) => q.id === id);
  if (i === -1) return;
  const copy = cloneQuestion($state.snapshot(app.quiz.questions[i]));
  if (copy.name) copy.name += ' (copy)';
  app.quiz.questions.splice(i + 1, 0, copy);
  app.selectedId = copy.id;
  notify('Question duplicated.', 'success', 2000);
}

export async function deleteQuestion(id) {
  const i = app.quiz.questions.findIndex((q) => q.id === id);
  if (i === -1) return;
  const ok = await ask({
    title: 'Delete question?',
    message: `"${questionTitle(app.quiz.questions[i])}" will be removed. You can undo this with Ctrl+Z.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  app.quiz.questions.splice(i, 1);
  if (app.selectedId === id) app.selectedId = app.quiz.questions[Math.min(i, app.quiz.questions.length - 1)]?.id ?? null;
}

export function moveQuestion(from, to) {
  moveItem(app.quiz.questions, from, to);
}

export async function newQuiz() {
  if (app.quiz.questions.length) {
    const ok = await ask({
      title: 'Start a new quiz?',
      message: 'All current questions will be cleared. Export first if you want to keep them. You can undo this with Ctrl+Z.',
      confirmLabel: 'Start new quiz',
      danger: true,
    });
    if (!ok) return;
  }
  app.quiz = createQuiz();
  app.selectedId = null;
}

/** Merges an importer result into the quiz. */
export function applyImport(result, mode = 'append') {
  const questions = result.questions.map((q) => normalizeQuestion(q, app.quiz.defaults));
  if (mode === 'replace') {
    const base = createQuiz();
    app.quiz = normalizeQuiz({ ...base, ...result.quiz, questions: [] });
    app.quiz.questions = questions;
  } else {
    if (!app.quiz.questions.length && result.quiz?.category) {
      app.quiz.category = result.quiz.category;
      if (result.quiz.name && app.quiz.name === 'Untitled quiz') app.quiz.name = result.quiz.name;
    }
    app.quiz.questions.push(...questions);
  }
  if (questions.length) app.selectedId = questions[0].id;
  app.tab = 'edit';
  return questions.length;
}
