// Private cloud copies of quizzes in Firebase: the user signs in with Google and each quiz is stored under their own
// account (see firestore.rules). Firebase's free plan has Firestore but no file storage, and a Firestore document
// holds at most 1 MiB, so a quiz's JSON (with its embedded images) is split over several documents:
//   users/{uid}/quizzes/{quizId}                  name, count, size, uploaded, version, chunks, folder
//   users/{uid}/quizzes/{quizId}/chunks/{version}-{n}  data
//   users/{uid}/folders/{folderId}                name, parent
// Folders point at their parent, and a null or absent folder or parent means the top level, so renaming or moving a
// folder is a single write however much it holds. A new upload writes its chunks first and only then points the quiz at them, so a failed upload leaves the previous
// copy intact. The SDK is loaded only when the cloud dialog opens.

import { uid } from './model.js';

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

/** Every folder in tree order as { id, name, depth }, leaving out the folder `skip` and everything below it. */
export function folderOptions(folders, skip = null) {
  const options = [];
  const walk = (parent, depth) => {
    for (const f of childFolders(folders, parent)) {
      if (f.id === skip) continue;
      options.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
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

/** The user's uploaded quizzes, most recently uploaded first. */
export async function listCloudQuizzes(userId) {
  const { db, store } = await load();
  const snap = await store.getDocs(store.collection(db, `users/${userId}/quizzes`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.uploaded - a.uploaded);
}

/** The user's folders, with every parent usable. */
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

/**
 * Deletes folders and the given quizzes in them. The quizzes go first, so that a failure part way leaves the rest
 * still in their folders.
 */
export async function deleteCloudFolders(userId, ids, quizzes, onProgress = () => {}) {
  for (let n = 0; n < quizzes.length; n++) {
    onProgress(n, quizzes.length);
    await deleteCloudQuiz(userId, quizzes[n]);
  }
  await deleteDocs(ids.map((id) => folderDocPath(userId, id)));
}

/**
 * Uploads a quiz, replacing the user's earlier copy of it, which keeps its folder.
 * @param {string} userId
 * @param {string} id the quiz's ID, which stays the same on every device
 * @param {string} text the quiz as JSON
 * @param {{ name: string, count: number, folder: string | null }} info `folder` is used for a first upload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<object>} the stored description of the quiz
 */
export async function uploadCloudQuiz(userId, id, text, info, onProgress = () => {}) {
  const { db, store } = await load();
  const ref = store.doc(db, quizPath(userId, id));
  const previous = await store.getDoc(ref);
  const chunks = splitChunks(text);
  const version = uid();
  let written = 0;
  try {
    for (; written < chunks.length; written++) {
      onProgress(written, chunks.length);
      await store.setDoc(store.doc(db, chunkPath(userId, id, version, written)), { data: chunks[written] });
    }
    const folder = previous.exists() ? (previous.data().folder ?? null) : info.folder;
    const meta = { name: info.name, count: info.count, size: text.length, uploaded: Date.now(), version, chunks: chunks.length, folder };
    await store.setDoc(ref, meta);
    onProgress(chunks.length, chunks.length);
    if (previous.exists()) await deleteChunks(userId, id, previous.data().version, previous.data().chunks).catch(() => {});
    return { id, ...meta };
  } catch (e) {
    // The earlier copy is untouched; clear what this attempt wrote.
    await deleteChunks(userId, id, version, written).catch(() => {});
    throw e;
  }
}

/** Reads an uploaded quiz back as JSON. `meta` is an entry from listCloudQuizzes. */
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

export async function deleteCloudQuiz(userId, meta) {
  const { db, store } = await load();
  await store.deleteDoc(store.doc(db, quizPath(userId, meta.id)));
  await deleteChunks(userId, meta.id, meta.version, meta.chunks).catch(() => {});
}

/** A sentence for the user about a failed Firebase call. */
export function cloudErrorMessage(e) {
  const code = String(e?.code ?? '');
  if (code === 'auth/unauthorized-domain') return `Sign-in isn't allowed from ${location.hostname} yet: add it under Authentication → Settings → Authorized domains in the Firebase console.`;
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/network-request-failed' || code.includes('unavailable') || code.includes('deadline-exceeded')) return 'Could not reach Firebase. Check your connection and try again.';
  if (code.includes('resource-exhausted')) return "Firebase's free daily limit has been reached. Try again tomorrow.";
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'Firebase refused the request. Sign out, sign in again and retry.';
  return e?.message || 'Something went wrong with Firebase.';
}
