import { createQuiz, normalizeQuiz, normalizeQuestion, createQuestion, cloneQuestion, moveItem, questionTitle } from './model.js';
import { FORMAT_MAP } from './formats/index.js';
import { downloadText, slugify } from './download.js';
import { dbGet, dbSet } from './db.js';

const STORAGE_KEY = 'mqe.quiz.v1';
const THEME_KEY = 'mqe.theme';
const LAYOUT_KEY = 'mqe.layout';
const BACKUP_KEY = 'mqe.backup';
const HISTORY_LIMIT = 200;
// Number of undo steps after which the user is first reminded to download a backup, and then again every REMIND_EVERY steps.
export const REMIND_AFTER = 30;
const REMIND_EVERY = 50;

// The quiz is kept in IndexedDB, which has room for embedded images. localStorage is only a fallback for when
// IndexedDB fails; a copy there is therefore newer than the one in IndexedDB. Older versions kept the quiz only there.
function readLocal() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function removeLocal() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Loads the saved quiz into the app. Call once, before the app is mounted. */
export async function loadSavedQuiz() {
  let raw = readLocal();
  if (raw) {
    // Move it into IndexedDB so localStorage is freed for the next time.
    try {
      await dbSet(STORAGE_KEY, raw);
      removeLocal();
    } catch {
      /* keep it in localStorage */
    }
  } else {
    try {
      raw = await dbGet(STORAGE_KEY);
    } catch {
      /* unavailable: start fresh */
    }
  }
  let quiz = null;
  try {
    if (raw) quiz = normalizeQuiz(JSON.parse(raw));
  } catch {
    /* corrupted: start fresh */
  }
  if (!quiz) return;
  app.quiz = quiz;
  app.selectedId = quiz.questions[0]?.id ?? null;
  current = JSON.stringify(app.quiz);
}

/** Wide-screen layouts: editor only, editor and preview side by side, or preview only. */
export const VIEWS = ['edit', 'split', 'preview'];
export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 600;
export const SIDEBAR_DEFAULT = 340;
const clampSidebar = (w) => (Number.isFinite(Number(w)) && w !== null && w !== '' ? Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(w)))) : SIDEBAR_DEFAULT);

function loadLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (l) {
      // Older versions stored only whether the preview was shown.
      const view = VIEWS.includes(l.view) ? l.view : l.showPreview === false ? 'edit' : 'split';
      return { view, splitRatio: Math.min(0.75, Math.max(0.25, Number(l.splitRatio) || 0.55)), sidebarWidth: clampSidebar(l.sidebarWidth) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { view: 'split', splitRatio: 0.55, sidebarWidth: SIDEBAR_DEFAULT };
}

function loadBackup() {
  try {
    const b = JSON.parse(localStorage.getItem(BACKUP_KEY));
    if (b) return { at: b.at ? new Date(b.at) : null, edits: Number(b.edits) || 0, remindAt: Number(b.remindAt) || REMIND_AFTER };
  } catch {
    /* fall through to defaults */
  }
  return { at: null, edits: 0, remindAt: REMIND_AFTER };
}

const layout = loadLayout();

export const app = $state({
  quiz: createQuiz(),
  selectedId: null,
  // Questions ticked in the list for bulk actions; independent of the question open in the editor.
  checked: [],
  // Narrow screens switch between edit and preview; wide screens show both side by side.
  tab: 'edit',
  wide: true,
  view: layout.view,
  splitRatio: layout.splitRatio,
  sidebarWidth: layout.sidebarWidth,
  // "Show correct answers" in the preview stays on while moving between questions.
  revealAnswers: false,
  theme: document.documentElement.dataset.theme || 'light',
  search: '',
  modal: null,
  modalProps: {},
  toasts: [],
  confirm: null,
  sidebarOpen: true,
});

export const history = $state({ canUndo: false, canRedo: false, savedAt: null, pending: false, saveFailed: false });

/** When the quiz was last downloaded as a whole, and how many undo steps have been made since. */
export const backup = $state(loadBackup());

function saveBackupState() {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- persistence & undo

let past = [];
let future = [];
let current = JSON.stringify(app.quiz);
let timer = null;

// Writes run one after another so that an older snapshot can never overwrite a newer one.
let writing = Promise.resolve();

function save(snapshot) {
  writing = writing.then(async () => {
    try {
      await dbSet(STORAGE_KEY, snapshot);
      removeLocal();
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, snapshot);
      } catch {
        if (!history.saveFailed) notify('Could not save in this browser (storage may be full). Download a backup to keep your work.', 'error', 0, backupAction);
        history.saveFailed = true;
        return;
      }
    }
    history.savedAt = new Date();
    history.saveFailed = false;
  });
}

const backupAction = { label: 'Download backup', run: () => downloadBackup() };

function countEdit() {
  backup.edits++;
  if (app.quiz.questions.length && backup.edits >= backup.remindAt) {
    backup.remindAt = backup.edits + REMIND_EVERY;
    notify(
      `Your work is only saved in this browser${backup.at ? '' : ' and has never been backed up'}. Download a backup so it isn't lost if browser data is cleared.`,
      'warning',
      15000,
      backupAction
    );
  }
  saveBackupState();
}

/** Records that the whole quiz has just been downloaded in a format that can be imported again. */
export function markBackedUp() {
  backup.at = new Date();
  backup.edits = 0;
  backup.remindAt = REMIND_AFTER;
  saveBackupState();
}

/** Downloads the whole quiz as a project (JSON) file. */
export function downloadBackup() {
  const { text } = FORMAT_MAP.json.export($state.snapshot(app.quiz));
  const name = `${slugify(app.quiz.name)}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadText(text, name, FORMAT_MAP.json.mime);
  markBackedUp();
  notify(`Downloaded ${name}. Import it to restore your quiz.`, 'success');
}

function updateFlags() {
  history.canUndo = past.length > 0;
  history.canRedo = future.length > 0;
}

function commit(snapshot) {
  clearTimeout(timer);
  timer = null;
  history.pending = false;
  if (snapshot === current) return;
  past.push(current);
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
  current = snapshot;
  save(snapshot);
  updateFlags();
  countEdit();
}

/** Tracks every change to the quiz; changes are grouped into undo steps after a short pause. */
export function initPersistence() {
  $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify(app.quiz);
      clearTimeout(timer);
      if (snapshot !== current) history.pending = true;
      timer = setTimeout(() => commit(snapshot), 350);
    });
  });
  window.addEventListener('beforeunload', () => timer && commit(JSON.stringify($state.snapshot(app.quiz))));
}

function restore(snapshot) {
  current = snapshot;
  app.quiz = JSON.parse(snapshot);
  if (!app.quiz.questions.some((q) => q.id === app.selectedId)) app.selectedId = app.quiz.questions[0]?.id ?? null;
  pruneChecked();
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

export function setSidebarWidth(w) {
  app.sidebarWidth = clampSidebar(w);
}

export function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ view: app.view, splitRatio: app.splitRatio, sidebarWidth: app.sidebarWidth }));
  } catch {
    /* ignore */
  }
}

export function setView(view) {
  app.view = view;
  saveLayout();
}

/** Cycles editor → both → preview on wide screens, or switches between edit and preview on narrow ones. */
export function cycleView() {
  if (app.wide) setView(VIEWS[(VIEWS.indexOf(app.view) + 1) % VIEWS.length]);
  else app.tab = app.tab === 'edit' ? 'preview' : 'edit';
}

// ---------------------------------------------------------------- notifications & dialogs

let toastId = 0;
/** Shows a toast. `action` ({ label, run }) adds a button; a timeout of 0 keeps the toast until dismissed. */
export function notify(message, kind = 'info', timeout = 4000, action = null) {
  const id = ++toastId;
  app.toasts.push({ id, message, kind, action });
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

/** Opens the previous (-1) or next (+1) question, or the first / last with -Infinity / Infinity. */
export function goToQuestion(step) {
  const list = app.quiz.questions;
  if (!list.length) return;
  app.selectedId = list[Math.min(list.length - 1, Math.max(0, selectedIndex() + step))].id;
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
  pruneChecked();
}

export function moveQuestion(from, to) {
  moveItem(app.quiz.questions, from, to);
}

// ---------------------------------------------------------------- bulk operations on ticked questions

function pruneChecked() {
  const ids = new Set(app.quiz.questions.map((q) => q.id));
  if (app.checked.some((id) => !ids.has(id))) app.checked = app.checked.filter((id) => ids.has(id));
}

export const isChecked = (id) => app.checked.includes(id);

export function setChecked(id, on) {
  if (on && !app.checked.includes(id)) app.checked.push(id);
  else if (!on && app.checked.includes(id)) app.checked = app.checked.filter((c) => c !== id);
}

/** Ticked questions in quiz order. */
export const checkedQuestions = () => app.quiz.questions.filter((q) => app.checked.includes(q.id));

const plural = (n) => `${n} question${n === 1 ? '' : 's'}`;

export async function deleteChecked() {
  const ids = new Set(app.checked);
  if (!ids.size) return;
  const ok = await ask({
    title: `Delete ${plural(ids.size)}?`,
    message: `The ${ids.size === 1 ? 'selected question' : `${ids.size} selected questions`} will be removed. You can undo this with Ctrl+Z.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  const list = app.quiz.questions;
  const firstIndex = list.findIndex((q) => ids.has(q.id));
  app.quiz.questions = list.filter((q) => !ids.has(q.id));
  if (ids.has(app.selectedId)) app.selectedId = app.quiz.questions[Math.min(firstIndex, app.quiz.questions.length - 1)]?.id ?? null;
  app.checked = [];
  notify(`Deleted ${plural(ids.size)}.`, 'success', 2500);
}

/** Inserts a copy after each ticked question and ticks the copies instead. */
export function duplicateChecked() {
  const ids = new Set(app.checked);
  const copies = [];
  app.quiz.questions = app.quiz.questions.flatMap((q) => {
    if (!ids.has(q.id)) return [q];
    const copy = cloneQuestion($state.snapshot(q));
    if (copy.name) copy.name += ' (copy)';
    copies.push(copy.id);
    return [q, copy];
  });
  app.checked = copies;
  notify(`Duplicated ${plural(copies.length)}.`, 'success', 2500);
}

/** Moves the ticked questions to the start or end of the quiz, keeping their relative order. */
export function moveChecked(where) {
  const ids = new Set(app.checked);
  const picked = app.quiz.questions.filter((q) => ids.has(q.id));
  const rest = app.quiz.questions.filter((q) => !ids.has(q.id));
  app.quiz.questions = where === 'top' ? [...picked, ...rest] : [...rest, ...picked];
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
  app.checked = [];
}

/** Merges an importer result into the quiz. */
export function applyImport(result, mode = 'append') {
  const questions = result.questions.map((q) => normalizeQuestion(q, app.quiz.defaults));
  if (mode === 'replace') {
    const base = createQuiz();
    app.quiz = normalizeQuiz({ ...base, ...result.quiz, questions: [] });
    app.quiz.questions = questions;
    app.checked = [];
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
