// Private cloud copies of quizzes in Firebase: the user signs in with Google and each quiz is stored under their own
// account (see firestore.rules). Firebase's free plan has Firestore but no file storage, and a Firestore document
// holds at most 1 MiB, so a quiz's JSON (with its embedded images) is split over several documents:
//   users/{uid}/quizzes/{quizId}                  name, count, review, size, uploaded, version, chunks, folder, history, deleted
//   users/{uid}/quizzes/{quizId}/chunks/{version}-{n}  data
//   users/{uid}/folders/{folderId}                name, parent, deleted
//   users/{uid}/search/{quizId}                   text: the questions as plain text, for searching
// Folders point at their parent, and a null or absent folder or parent means the top level, so renaming or moving a
// folder is a single write however much it holds. A new upload writes its chunks first and only then points the quiz
// at them, so a failed upload leaves the previous copy intact. The previous copies stay as `history` (newest first),
// up to KEEP_VERSIONS in all; automatic uploads (`auto`, with `since` the time the run began) replace each other for
// an hour, so they don't push the earlier copies out. Deleting puts a quiz or folder in the trash by setting `deleted` (a time); what is inside
// a deleted folder stays where it is, hidden with it, and comes back with it. The SDK is loaded only when needed.

import { uid, questionTitle } from './model.js';
import { questionContent } from './quality.js';

/** How many uploads of a quiz are kept, the current one included. */
export const KEEP_VERSIONS = 5;
/** Days a deleted quiz or folder stays in the trash. */
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
/** Automatic uploads within this time of the first one replace each other in the version history. */
export const AUTO_SESSION = 60 * 60 * 1000;
// Plain text of a quiz kept for searching; a Firestore document must stay under 1 MiB, which this does at 3 bytes per unit.
const SEARCH_LIMIT = 300_000;
const QUESTION_LIMIT = 2000;

// The web config identifies the project and is public by design; firestore.rules is what protects the data.
const CONFIG = {
  apiKey: 'AIzaSyCQv6athdL-GOcVyNEWLZk1VoxVxqoIPPY',
  authDomain: 'moodler-6ldqy.firebaseapp.com',
  projectId: 'moodler-6ldqy',
  appId: '1:992899252996:web:88b22ab2c49decdfca0651',
};

// UTF-8 takes at most 3 bytes per UTF-16 unit, so this stays under the 1 MiB limit whatever the text is.
const CHUNK_SIZE = 300_000;
const BATCH_SIZE = 400;

/** Splits text into pieces of at most `size` units, never between the two halves of a surrogate pair. */
export function splitChunks(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let at = 0; at < text.length; ) {
    let end = Math.min(at + size, text.length);
    const unit = text.charCodeAt(end - 1);
    if (end < text.length && unit >= 0xd800 && unit <= 0xdbff) end--;
    chunks.push(text.slice(at, end));
    at = end;
  }
  return chunks;
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Folders with every parent usable. Two devices can leave a folder pointing at a deleted parent or, by moving folders
 * at the same time, in a loop; those go to the top level so that nothing becomes unreachable.
 */
export function normalizeFolders(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return folders.map((f) => {
    const seen = new Set([f.id]);
    let at = f.parent ?? null;
    while (at && byId.has(at) && !seen.has(at)) {
      seen.add(at);
      at = byId.get(at).parent ?? null;
    }
    return { ...f, parent: at ? null : (f.parent ?? null) };
  });
}

/** The folders from the top level down to `id`. */
export function folderPath(folders, id) {
  const path = [];
  for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f.parent)) path.unshift(f);
  return path;
}

/** The folder directly inside `parent` (null for the top level), sorted by name. */
export const childFolders = (folders, parent) => folders.filter((f) => (f.parent ?? null) === parent).sort(byName);

/** The IDs of a folder and everything below it. */
export function folderTreeIds(folders, id) {
  const ids = [id];
  for (const at of ids) for (const f of folders) if (f.parent === at) ids.push(f.id);
  return ids;
}

/**
 * Every folder in tree order as { id, name, parent, depth, hasChildren }, leaving out the folder `skip` and everything
 * below it, and whatever is below a folder that `isExpanded` says is collapsed.
 */
export function folderOptions(folders, skip = null, isExpanded = () => true) {
  const options = [];
  const walk = (parent, depth) => {
    for (const f of childFolders(folders, parent)) {
      if (f.id === skip) continue;
      const hasChildren = folders.some((x) => x.parent === f.id && x.id !== skip);
      options.push({ id: f.id, name: f.name, parent: f.parent ?? null, depth, hasChildren });
      if (isExpanded(f.id)) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
}

/**
 * Splits the stored folders and quizzes into what is shown and what is in the trash. A folder or quiz is hidden when it,
 * or a folder above it, is deleted; the trash lists the ones deleted themselves, newest first, each with what it holds:
 *   { folders, quizzes, trash: [{ kind: 'folder' | 'quiz', id, name, deleted, from, item, folderIds, quizzes }] }
 * where `from` is the folder it was in (null for the top level) and, for a folder, `folderIds` and `quizzes` are
 * everything below it, deleted or not, which goes when it is deleted for good.
 */
export function cloudView(allFolders, allQuizzes) {
  const folders = normalizeFolders(allFolders);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const hidden = new Set();
  for (const f of folders) {
    for (let at = f; at; at = byId.get(at.parent)) {
      if (at.deleted) {
        hidden.add(f.id);
        break;
      }
    }
  }
  // A quiz whose folder is gone (deleted for good on another device) is at the top level.
  const folderOf = (q) => (byId.has(q.folder) ? q.folder : null);
  const trash = [];
  for (const f of folders) {
    if (!f.deleted) continue;
    const folderIds = folderTreeIds(folders, f.id);
    const quizzes = allQuizzes.filter((q) => folderIds.includes(folderOf(q)));
    trash.push({ kind: 'folder', id: f.id, name: f.name, deleted: f.deleted, from: f.parent ?? null, item: f, folderIds, quizzes });
  }
  for (const q of allQuizzes) if (q.deleted) trash.push({ kind: 'quiz', id: q.id, name: q.name, deleted: q.deleted, from: folderOf(q), item: q });
  trash.sort((a, b) => b.deleted - a.deleted);
  return {
    folders: folders.filter((f) => !hidden.has(f.id)),
    quizzes: allQuizzes.filter((q) => !q.deleted && !hidden.has(q.folder)).map((q) => ({ ...q, folder: folderOf(q) })),
    trash,
  };
}

/** Whole days until a trash entry is deleted for good; 0 or less means it is due. */
export const daysLeft = (deleted, now = Date.now()) => Math.ceil((deleted + TRASH_DAYS * DAY - now) / DAY);

/** Lower case without accents, so that "é" finds "e" and the other way round. */
export const foldText = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A quiz's questions as plain text for searching: one line per question, its title then its text and answers. */
export function searchText(quiz) {
  let text = '';
  for (const q of quiz.questions ?? []) {
    const title = questionTitle(q).replace(/\s+/g, ' ');
    const content = questionContent(q).replace(/\s+/g, ' ').trim();
    const line = `${title}\t${content === title ? '' : content}`.slice(0, QUESTION_LIMIT).replace(/[\uD800-\uDBFF]$/, '');
    if (text.length + line.length + 1 > SEARCH_LIMIT) break;
    text += line + '\n';
  }
  return text;
}

/**
 * How a quiz matches a search: every word of the query must be in its name, or all in the same question.
 * Returns null when it doesn't match, else { byName, questions: [{ title, excerpt }] } with up to `max` questions.
 */
export function matchQuiz(name, text, query, max = 3) {
  const terms = foldText(query).split(' ').filter(Boolean);
  if (!terms.length) return null;
  const byName = terms.every((t) => foldText(name).includes(t));
  const questions = [];
  let total = 0;
  for (const line of (text ?? '').split('\n')) {
    if (!line) continue;
    const folded = foldText(line);
    if (!terms.every((t) => folded.includes(t))) continue;
    total++;
    if (questions.length >= max) continue;
    const [title, content = ''] = line.split('\t');
    // A question without a name is titled by the start of its text, which the excerpt already shows.
    const named = content && !content.startsWith(title.replace(/…$/, ''));
    questions.push({ title: named ? title : '', excerpt: excerpt(content || title, terms[0]) });
  }
  return byName || total ? { byName, questions, total } : null;
}

/** About 120 characters of `text` around the first place `term` (folded) appears. */
function excerpt(text, term) {
  // Folding keeps the length for nearly all text, so the position found in the folded text is close enough.
  const at = Math.max(0, foldText(text).indexOf(term));
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, start + 120);
  return (start ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

let services = null;

function load() {
  services ??= (async () => {
    const [{ initializeApp }, authSdk, store] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]);
    const firebase = initializeApp(CONFIG);
    const auth = authSdk.getAuth(firebase);
    const db = store.getFirestore(firebase);
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      store.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    return { auth, db, authSdk, store };
  })().catch((e) => {
    services = null;
    throw e;
  });
  return services;
}

/** Calls `callback` with the signed-in user or null, now and on every change. Resolves to a function that stops it. */
export async function watchUser(callback) {
  const { auth, authSdk } = await load();
  return authSdk.onAuthStateChanged(auth, callback);
}

/** The signed-in user, or null, once Firebase has restored the last session. */
export async function currentUser() {
  const { auth } = await load();
  await auth.authStateReady();
  return auth.currentUser;
}

/** Opens Google's sign-in window. Resolves to false when the user closes it. */
export async function signIn() {
  const { auth, authSdk } = await load();
  try {
    await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
    return true;
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return false;
    throw e;
  }
}

export async function signOut() {
  const { auth, authSdk } = await load();
  await authSdk.signOut(auth);
}

const quizPath = (userId, id) => `users/${userId}/quizzes/${id}`;
const chunkPath = (userId, id, version, n) => `${quizPath(userId, id)}/chunks/${version}-${n}`;
const searchPath = (userId, id) => `users/${userId}/search/${id}`;

/** One uploaded quiz's description, or null when there is none. */
export async function getCloudQuiz(userId, id) {
  const { db, store } = await load();
  const snap = await store.getDoc(store.doc(db, quizPath(userId, id)));
  return snap.exists() ? { id, ...snap.data() } : null;
}

/** The searchable text of every uploaded quiz, as a Map from quiz ID. Quizzes uploaded before searching existed have none. */
export async function listSearchTexts(userId) {
  const { db, store } = await load();
  const snap = await store.getDocs(store.collection(db, `users/${userId}/search`));
  return new Map(snap.docs.map((d) => [d.id, d.data().text ?? '']));
}

/** The user's uploaded quizzes, deleted ones included, most recently uploaded first. */
export async function listCloudQuizzes(userId) {
  const { db, store } = await load();
  const snap = await store.getDocs(store.collection(db, `users/${userId}/quizzes`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.uploaded - a.uploaded);
}

/** The user's folders, deleted ones included, with every parent usable. */
export async function listCloudFolders(userId) {
  const { db, store } = await load();
  const snap = await store.getDocs(store.collection(db, `users/${userId}/folders`));
  return normalizeFolders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

const folderDocPath = (userId, id) => `users/${userId}/folders/${id}`;

export async function createCloudFolder(userId, name, parent) {
  const { db, store } = await load();
  const id = uid();
  await store.setDoc(store.doc(db, folderDocPath(userId, id)), { name, parent });
  return id;
}

/** Renames or moves a folder: `changes` holds a new name, a new parent, or both. */
export async function updateCloudFolder(userId, id, changes) {
  const { db, store } = await load();
  await store.updateDoc(store.doc(db, folderDocPath(userId, id)), changes);
}

/** Renames an uploaded quiz. The quiz inside keeps its old name until it is uploaded again; opening it uses this one. */
export async function renameCloudQuiz(userId, id, name) {
  const { db, store } = await load();
  await store.updateDoc(store.doc(db, quizPath(userId, id)), { name });
}

export async function moveCloudQuiz(userId, id, folder) {
  const { db, store } = await load();
  await store.updateDoc(store.doc(db, quizPath(userId, id)), { folder });
}

async function deleteDocs(paths) {
  const { db, store } = await load();
  for (let n = 0; n < paths.length; n += BATCH_SIZE) {
    const batch = store.writeBatch(db);
    for (const path of paths.slice(n, n + BATCH_SIZE)) batch.delete(store.doc(db, path));
    await batch.commit();
  }
}

const deleteChunks = (userId, id, version, count) => deleteDocs(Array.from({ length: count }, (_, n) => chunkPath(userId, id, version, n)));

/** Every upload of a quiz still stored: the current one first, then the older ones, newest first. */
export const quizVersions = (meta) => [
  { version: meta.version, chunks: meta.chunks, size: meta.size, count: meta.count, uploaded: meta.uploaded, name: meta.name },
  ...(meta.history ?? []),
];

/**
 * Whether an automatic upload replaces the current version instead of adding one: it does while automatic uploads
 * follow each other within AUTO_SESSION, so the version history keeps one copy per working session.
 */
export function replacesVersion(previous, auto, now = Date.now()) {
  return !!(auto && previous && !previous.deleted && previous.auto && now - (previous.since ?? previous.uploaded) < AUTO_SESSION);
}

/** Puts a quiz or folder in the trash. */
export async function trashCloudItem(userId, kind, id) {
  const { db, store } = await load();
  await store.updateDoc(store.doc(db, kind === 'folder' ? folderDocPath(userId, id) : quizPath(userId, id)), { deleted: Date.now() });
}

/**
 * Takes a quiz or folder out of the trash, into folder `into` (null for the top level). `name` renames a folder
 * whose name is taken there by now.
 */
export async function restoreCloudItem(userId, kind, id, into, name = null) {
  const { db, store } = await load();
  const changes = kind === 'folder' ? { parent: into, ...(name ? { name } : {}) } : { folder: into };
  await store.updateDoc(store.doc(db, kind === 'folder' ? folderDocPath(userId, id) : quizPath(userId, id)), { ...changes, deleted: store.deleteField() });
}

/**
 * Deletes folders and the given quizzes in them for good. The quizzes go first, so that a failure part way leaves the
 * rest still in their folders.
 */
export async function deleteCloudFolders(userId, ids, quizzes, onProgress = () => {}) {
  for (let n = 0; n < quizzes.length; n++) {
    onProgress(n, quizzes.length);
    await deleteCloudQuiz(userId, quizzes[n]);
  }
  await deleteDocs(ids.map((id) => folderDocPath(userId, id)));
}

/**
 * How many questions of a quiz are reviewed and how many are still to review, or null for a quiz that never went
 * through review. As in the question list, every question not marked as to review counts as reviewed.
 */
export function reviewCounts(quiz) {
  const qs = quiz?.questions ?? [];
  const todo = qs.filter((q) => q.unreviewed).length;
  if (!todo && !qs.some((q) => q.reviewed)) return null;
  return { done: qs.length - todo, todo };
}

function reviewOf(text) {
  try {
    return reviewCounts(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Uploads a quiz as its newest version. The earlier upload is kept in its history and keeps its folder; one in the
 * trash comes out of it, into `info.folder`.
 * @param {string} userId
 * @param {string} id the quiz's ID, which stays the same on every device
 * @param {string} text the quiz as JSON
 * @param {{ name: string, count: number, folder: string | null, search?: string, auto?: boolean }} info `folder` is used
 *   for a first upload, `search` is the quiz's searchable text (see searchText), and `auto` marks an automatic upload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<object>} the stored description of the quiz
 */
export async function uploadCloudQuiz(userId, id, text, info, onProgress = () => {}) {
  const { db, store } = await load();
  const ref = store.doc(db, quizPath(userId, id));
  const snap = await store.getDoc(ref);
  const previous = snap.exists() ? snap.data() : null;
  const chunks = splitChunks(text);
  const version = uid();
  let written = 0;
  try {
    for (; written < chunks.length; written++) {
      onProgress(written, chunks.length);
      await store.setDoc(store.doc(db, chunkPath(userId, id, version, written)), { data: chunks[written] });
    }
    const folder = previous && !previous.deleted ? (previous.folder ?? null) : info.folder;
    const now = Date.now();
    const replace = replacesVersion(previous, info.auto, now);
    const older = previous ? (replace ? (previous.history ?? []) : quizVersions(previous)) : [];
    const meta = { name: info.name, count: info.count, size: text.length, uploaded: now, version, chunks: chunks.length, folder, history: older.slice(0, KEEP_VERSIONS - 1) };
    const review = reviewOf(text);
    if (review) meta.review = review;
    if (info.auto) Object.assign(meta, { auto: true, since: replace ? (previous.since ?? previous.uploaded) : now });
    await store.setDoc(ref, meta);
    onProgress(chunks.length, chunks.length);
    const dropped = [...older.slice(KEEP_VERSIONS - 1), ...(replace ? [previous] : [])];
    for (const old of dropped) await deleteChunks(userId, id, old.version, old.chunks).catch(() => {});
    // Searching is a convenience: the upload has succeeded even if this fails.
    if (info.search != null) await store.setDoc(store.doc(db, searchPath(userId, id)), { text: info.search }).catch(() => {});
    return { id, ...meta };
  } catch (e) {
    // The earlier copy is untouched; clear what this attempt wrote.
    await deleteChunks(userId, id, version, written).catch(() => {});
    throw e;
  }
}

/**
 * Reads an uploaded quiz back as JSON. `meta` is an entry from listCloudQuizzes, or one of its versions with the
 * quiz's `id` added.
 */
export async function downloadCloudQuiz(userId, meta, onProgress = () => {}) {
  const { db, store } = await load();
  let text = '';
  for (let n = 0; n < meta.chunks; n++) {
    onProgress(n, meta.chunks);
    const chunk = await store.getDoc(store.doc(db, chunkPath(userId, meta.id, meta.version, n)));
    if (!chunk.exists()) throw new Error('Part of this quiz is missing from the cloud. Try again, or upload it again from another device.');
    text += chunk.data().data;
  }
  onProgress(meta.chunks, meta.chunks);
  return text;
}

/** Deletes a quiz for good, with every version of it. */
export async function deleteCloudQuiz(userId, meta) {
  const { db, store } = await load();
  await store.deleteDoc(store.doc(db, quizPath(userId, meta.id)));
  await store.deleteDoc(store.doc(db, searchPath(userId, meta.id))).catch(() => {});
  for (const v of quizVersions(meta)) await deleteChunks(userId, meta.id, v.version, v.chunks).catch(() => {});
}

/** A sentence for the user about a failed Firebase call. */
export function cloudErrorMessage(e) {
  const code = String(e?.code ?? '');
  // The app never names the service behind the cloud to its users.
  if (code === 'auth/unauthorized-domain') return `Sign-in isn't allowed from ${location.hostname} yet.`;
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'The sign-in window was closed before signing in finished.';
  if (code === 'auth/network-request-failed' || code.includes('unavailable') || code.includes('deadline-exceeded')) return 'Could not reach the cloud. Check your connection and try again.';
  if (code.includes('resource-exhausted')) return "The cloud's daily limit has been reached. Try again tomorrow.";
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'The cloud refused the request. Sign out, sign in again and retry.';
  const message = String(e?.message ?? '')
    .replace(/\bFirebase(Error)?:?\s*/gi, '')
    .replace(/\s*\((auth|firestore)\/[^)]*\)\.?/g, '')
    .trim();
  return message && !/^error\.?$/i.test(message) ? message : 'Something went wrong in the cloud. Try again.';
}
