// Minimal IndexedDB key-value store. Unlike localStorage (about 5 MB), it can hold quizzes with many embedded images.

const DB_NAME = 'moodler';
const STORE = 'kv';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    // Let a later call try again (e.g. after a transient failure).
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
  );
}

export const dbGet = (key) => run('readonly', (s) => s.get(key));
export const dbSet = (key, value) => run('readwrite', (s) => s.put(value, key));
export const dbDelete = (key) => run('readwrite', (s) => s.delete(key));
