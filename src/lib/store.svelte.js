import { createQuiz, normalizeQuiz, normalizeQuestion, createQuestion, cloneQuestion, moveItem, questionTitle, uid } from './model.js';
import { FORMAT_MAP } from './formats/index.js';
import { downloadText, slugify } from './download.js';
import { dbGet, dbSet, dbDelete } from './db.js';

// Older versions kept a single quiz under this key; it is moved into the library on first load.
const LEGACY_KEY = 'mqe.quiz.v1';
// The list of quizzes; each quiz itself is stored under its own key.
const LIBRARY_KEY = 'mqe.library.v1';
const quizKey = (id) => `mqe.quiz.${id}`;
const THEME_KEY = 'mqe.theme';
const LAYOUT_KEY = 'mqe.layout';
const BACKUP_KEY = 'mqe.backup';
const HISTORY_LIMIT = 200;
// Number of undo steps after which the user is first reminded to download a backup, and then again every REMIND_EVERY steps.
export const REMIND_AFTER = 30;
const REMIND_EVERY = 50;

// Quizzes are kept in IndexedDB, which has room for embedded images. localStorage is only a fallback for when
// IndexedDB fails; a copy there is therefore newer than the one in IndexedDB. Older versions kept the quiz only there.
function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

async function readStored(key) {
  const local = readLocal(key);
  if (local != null) {
    // Move it into IndexedDB so localStorage is freed for the next time.
    try {
      await dbSet(key, local);
      removeLocal(key);
    } catch {
      /* keep it in localStorage */
    }
    return local;
  }
  try {
    return (await dbGet(key)) ?? null;
  } catch {
    return null;
  }
}

/** Resolves to false when neither IndexedDB nor localStorage could take the value. */
async function writeStored(key, value) {
  try {
    await dbSet(key, value);
    removeLocal(key);
    return true;
  } catch {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

async function removeStored(key) {
  removeLocal(key);
  try {
    await dbDelete(key);
  } catch {
    /* ignore */
  }
}

function parseQuiz(raw) {
  try {
    return raw ? normalizeQuiz(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const entryFor = (id, quiz) => ({ id, name: quiz.name || 'Untitled quiz', count: quiz.questions.length, updated: Date.now() });

/** Loads the quiz list and the open quiz into the app. Call once, before the app is mounted. */
export async function loadSavedQuiz() {
  let saved = null;
  try {
    saved = JSON.parse(await readStored(LIBRARY_KEY));
  } catch {
    /* missing or corrupted: start a new list */
  }
  if (saved?.quizzes?.length) {
    library.quizzes = saved.quizzes;
    library.activeId = saved.quizzes.some((q) => q.id === saved.activeId) ? saved.activeId : saved.quizzes[0].id;
    const quiz = parseQuiz(await readStored(quizKey(library.activeId)));
    if (quiz) app.quiz = quiz;
    else {
      // Never reuse the key of a quiz that couldn't be read, so edits can't overwrite whatever is still stored there.
      const id = uid();
      library.quizzes.push(entryFor(id, app.quiz));
      library.activeId = id;
      notify('Your last quiz could not be opened. A new quiz was started; your other quizzes are in the quiz list.', 'warning', 8000);
    }
  } else {
    const id = uid();
    const legacy = parseQuiz(await readStored(LEGACY_KEY));
    if (legacy) app.quiz = legacy;
    library.quizzes = [entryFor(id, app.quiz)];
    library.activeId = id;
    if (legacy && (await writeStored(quizKey(id), JSON.stringify(legacy))) && (await writeStored(LIBRARY_KEY, libraryJson()))) await removeStored(LEGACY_KEY);
  }
  app.selectedId = app.quiz.questions[0]?.id ?? null;
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

/** Every quiz saved in this browser ({ id, name, count, updated }), and which one is open. */
export const library = $state({ quizzes: [], activeId: null });
const libraryJson = () => JSON.stringify({ activeId: library.activeId, quizzes: library.quizzes });
export const byRecent = (a, b) => b.updated - a.updated;

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

// Undo history of the open quiz; the other quizzes' histories are parked in `stacks` while they are closed.
let past = [];
let future = [];
const stacks = new Map();
let current = JSON.stringify(app.quiz);
let timer = null;

// Writes run one after another so that an older snapshot can never overwrite a newer one.
let writing = Promise.resolve();
const enqueue = (fn) => (writing = writing.then(fn));

/** Saves a quiz (the open one unless `id` is given) together with the quiz list. */
function save(snapshot, id = library.activeId) {
  enqueue(async () => {
    if (!(await writeStored(quizKey(id), snapshot)) || !(await writeStored(LIBRARY_KEY, libraryJson()))) {
      if (!history.saveFailed) notify('Could not save in this browser (storage may be full). Download a backup to keep your work.', 'error', 0, backupAction);
      history.saveFailed = true;
      return;
    }
    history.savedAt = new Date();
    history.saveFailed = false;
  });
}

const saveLibrary = () => enqueue(() => writeStored(LIBRARY_KEY, libraryJson()));

/** Refreshes the open quiz's entry in the list after a change. */
function touchEntry() {
  const entry = library.quizzes.find((q) => q.id === library.activeId);
  if (entry) Object.assign(entry, entryFor(entry.id, app.quiz));
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

/** Downloads every quiz as a project (JSON) file: a plain quiz file when there is only one. */
export async function downloadBackup() {
  const date = new Date().toISOString().slice(0, 10);
  let text, name;
  if (library.quizzes.length < 2) {
    ({ text } = FORMAT_MAP.json.export($state.snapshot(app.quiz)));
    name = `${slugify(app.quiz.name)}-backup-${date}.json`;
  } else {
    const quizzes = [];
    for (const entry of [...library.quizzes].sort(byRecent)) {
      const quiz = entry.id === library.activeId ? $state.snapshot(app.quiz) : parseQuiz(await readStored(quizKey(entry.id)));
      if (quiz) quizzes.push(quiz);
    }
    text = JSON.stringify({ app: 'moodler', version: 1, quizzes }, null, 2);
    name = `moodler-backup-${date}.json`;
  }
  downloadText(text, name, FORMAT_MAP.json.mime);
  markBackedUp();
  notify(`Downloaded ${name}. Import it to restore your ${library.quizzes.length < 2 ? 'quiz' : 'quizzes'}.`, 'success');
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
  touchEntry();
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
  touchEntry();
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

// ---------------------------------------------------------------- quiz library

/** Makes `quiz` the open quiz, keeping the previous quiz's undo history for when it is reopened. */
function activate(id, quiz) {
  commit(JSON.stringify($state.snapshot(app.quiz)));
  // A quiz that was never changed hasn't been written yet; store it so its entry in the list can be opened again.
  save(current);
  stacks.set(library.activeId, { past, future });
  ({ past, future } = stacks.get(id) ?? { past: [], future: [] });
  library.activeId = id;
  app.quiz = quiz;
  current = JSON.stringify(quiz);
  app.selectedId = quiz.questions[0]?.id ?? null;
  app.checked = [];
  app.search = '';
  app.tab = 'edit';
  updateFlags();
  saveLibrary();
}

/** Reads a quiz from storage, or the live copy when it is the open one. */
async function loadQuiz(id) {
  return id === library.activeId ? $state.snapshot(app.quiz) : parseQuiz(await readStored(quizKey(id)));
}

/** Opens another saved quiz. Resolves to false when it couldn't be read. */
export async function switchQuiz(id) {
  if (id === library.activeId) return true;
  if (!library.quizzes.some((q) => q.id === id)) return false;
  const quiz = await loadQuiz(id);
  if (!quiz) {
    notify('Could not open that quiz: its saved data is missing or damaged.', 'error');
    return false;
  }
  activate(id, quiz);
  return true;
}

/** Adds a quiz to the list and opens it. Other quizzes are kept. */
export function createNewQuiz(quiz = createQuiz()) {
  const id = uid();
  library.quizzes.push(entryFor(id, quiz));
  activate(id, quiz);
  save(current, id);
  return id;
}

export function newQuiz() {
  createNewQuiz();
  if (library.quizzes.length > 1) notify('Started a new quiz. Your other quizzes are in the quiz list (Alt+O).', 'success', 4000, { label: 'Show quizzes', run: () => openModal('quizzes') });
}

/** Saves a quiz that isn't open as a new entry in the list. */
function addClosedQuiz(quiz) {
  const id = uid();
  library.quizzes.push(entryFor(id, quiz));
  save(JSON.stringify(quiz), id);
  return id;
}

export async function duplicateQuiz(id) {
  const quiz = await loadQuiz(id);
  if (!quiz) return notify('Could not copy that quiz: its saved data is missing or damaged.', 'error');
  quiz.name = `${quiz.name || 'Untitled quiz'} (copy)`;
  const copy = addClosedQuiz(quiz);
  notify(`Created “${quiz.name}”.`, 'success', 4000, { label: 'Open', run: () => switchQuiz(copy) });
}

export async function renameQuiz(id, name) {
  name = name.trim() || 'Untitled quiz';
  if (id === library.activeId) {
    app.quiz.name = name;
    return;
  }
  const entry = library.quizzes.find((q) => q.id === id);
  const quiz = await loadQuiz(id);
  if (!entry || !quiz) return;
  quiz.name = entry.name = name;
  save(JSON.stringify(quiz), id);
}

export async function deleteQuiz(id) {
  const entry = library.quizzes.find((q) => q.id === id);
  if (!entry) return;
  const ok = await ask({
    title: 'Delete quiz?',
    message: `“${entry.name}” and its ${plural(entry.count)} will be removed from this browser.`,
    confirmLabel: 'Delete quiz',
    danger: true,
  });
  if (!ok) return;
  const saved = await loadQuiz(id);
  if (id === library.activeId) {
    // Open the most recently changed of the others, or a fresh quiz when this was the last one.
    const next = library.quizzes.filter((q) => q.id !== id).sort(byRecent)[0];
    if (!next || !(await switchQuiz(next.id))) createNewQuiz();
  }
  library.quizzes = library.quizzes.filter((q) => q.id !== id);
  stacks.delete(id);
  saveLibrary();
  enqueue(() => removeStored(quizKey(id)));
  const restore = saved && {
    label: 'Undo',
    run: () => {
      library.quizzes.push(entry);
      save(JSON.stringify(saved), id);
    },
  };
  notify(`Deleted “${entry.name}”.`, 'success', 8000, restore);
}

/** Copies (or moves) questions of the open quiz to another quiz, or to a new one when `targetId` is null. */
export async function copyQuestionsTo(targetId, ids, move = false) {
  const picked = app.quiz.questions.filter((q) => ids.includes(q.id));
  if (!picked.length) return;
  const copies = picked.map((q) => cloneQuestion($state.snapshot(q)));
  let quiz;
  if (targetId) {
    quiz = await loadQuiz(targetId);
    if (!quiz) return notify('Could not open that quiz: its saved data is missing or damaged.', 'error');
    quiz.questions.push(...copies);
    const entry = library.quizzes.find((q) => q.id === targetId);
    if (entry) Object.assign(entry, entryFor(targetId, quiz));
    save(JSON.stringify(quiz), targetId);
  } else {
    quiz = { ...createQuiz(), questions: copies };
    targetId = addClosedQuiz(quiz);
  }
  if (move) {
    const gone = new Set(picked.map((q) => q.id));
    const first = app.quiz.questions.findIndex((q) => gone.has(q.id));
    app.quiz.questions = app.quiz.questions.filter((q) => !gone.has(q.id));
    if (gone.has(app.selectedId)) app.selectedId = app.quiz.questions[Math.min(first, app.quiz.questions.length - 1)]?.id ?? null;
    pruneChecked();
  }
  notify(`${move ? 'Moved' : 'Copied'} ${plural(copies.length)} to “${quiz.name}”.`, 'success', 5000, { label: 'Open quiz', run: () => switchQuiz(targetId) });
}

/** Adds every quiz from a full backup as separate quizzes, without opening them. */
function importQuizzes(quizzes) {
  let n = 0;
  for (const raw of quizzes) {
    const quiz = normalizeQuiz(raw);
    addClosedQuiz(quiz);
    n += quiz.questions.length;
  }
  notify(`Added ${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'} to your quiz list.`, 'success', 5000, { label: 'Show quizzes', run: () => openModal('quizzes') });
  return n;
}

/**
 * Applies an importer result: adds the questions to the open quiz ('append'), replaces its contents ('replace')
 * or opens them as a new quiz ('new'), named after the file when the import has no name of its own.
 */
export function applyImport(result, mode = 'append', fileName = '') {
  if (result.quizzes) return importQuizzes(result.quizzes);
  const fresh = mode !== 'append' && normalizeQuiz({ ...createQuiz(), ...result.quiz, questions: [] });
  const questions = result.questions.map((q) => normalizeQuestion(q, (fresh || app.quiz).defaults));
  if (mode === 'new') {
    fresh.questions = questions;
    if (fileName && !result.quiz?.name) fresh.name = fileName.replace(/\.[^.]+$/, '');
    createNewQuiz(fresh);
  } else if (mode === 'replace') {
    app.quiz = fresh;
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
