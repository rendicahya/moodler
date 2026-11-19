// Uploading quizzes' changes without opening the cloud dialog, for quizzes that are already in the cloud: by hand
// with the Upload changes button, or automatically a few seconds after editing stops.

import { library, notify, ask, openModal, quizForUpload, markCloudSynced } from './store.svelte.js';

/** How long editing must pause before an automatic upload. */
export const AUTO_DELAY = 8000;

export const sync = $state({
  busy: false,
  done: 0,
  total: 0,
  // Whether the running upload is an automatic one.
  background: false,
  // Quizzes that can't be uploaded automatically until they are uploaded by hand: { [id]: cloudVersion }.
  blocked: {},
  // The last automatic upload's error, shown until one succeeds.
  error: '',
});

/** Whether a quiz in this browser has been edited since it was last uploaded or downloaded. */
export const editedSinceUpload = (entry) => !!entry?.cloudVersion && entry.updated !== entry.cloudUpdated;

/** Whether automatic uploading is waiting on this quiz. */
export const autoBlocked = (entry) => !!entry && sync.blocked[entry.id] === entry.cloudVersion;

const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Uploads a quiz (the open one by default) over its cloud copy, resolving to true once it is uploaded. Opens the cloud
 * dialog when that needs a choice, such as signing in.
 */
export async function uploadChanges(quizId) {
  const target = typeof quizId === 'string' ? quizId : library.activeId;
  if (sync.busy) {
    // Asked for a particular quiz (to close it): wait for the running upload, which may already include it.
    if (target !== quizId) return false;
    while (sync.busy) await new Promise((r) => setTimeout(r, 200));
  }
  const entry = library.quizzes.find((q) => q.id === target);
  if (!entry?.cloudVersion) return openModal('cloud'), false;
  if (target === quizId && !editedSinceUpload(entry)) return true;
  Object.assign(sync, { busy: true, background: false, done: 0, total: 0 });
  let cloud;
  try {
    cloud = await import('./cloud.js');
    const user = await cloud.currentUser();
    if (!user) {
      notify('Sign in to upload this quiz.', 'info');
      return openModal('cloud');
    }
    const prepared = await quizForUpload(entry.id);
    if (!prepared) return notify('Could not read this quiz to upload it.', 'error');
    const { id, text, name, count, entry: fresh, updated } = prepared;
    const existing = await cloud.getCloudQuiz(user.uid, id);
    if (!existing || existing.deleted) {
      notify(existing ? 'The cloud copy of this quiz is in the trash. Choose a folder to upload it to.' : 'This quiz is no longer in the cloud. Choose a folder to upload it to.', 'info', 6000);
      return openModal('cloud');
    }
    if (existing.version !== fresh.cloudVersion) {
      const ok = await ask({
        title: 'Replace the cloud copy?',
        message: `The cloud copy of “${existing.name}” (uploaded ${when(existing.uploaded)}) isn't the one this browser last synced with, so it may have changes this browser doesn't have. Uploading replaces it; the earlier copy stays in its version history.`,
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    const meta = await cloud.uploadCloudQuiz(user.uid, id, text, { name, count, folder: null, search: cloud.searchText(JSON.parse(text)) }, (done, total) => Object.assign(sync, { done, total }));
    markCloudSynced(id, meta.version, updated);
    delete sync.blocked[id];
    sync.error = '';
    notify(`Saved the changes to “${name}” in the cloud.`, 'success', 3000);
    return true;
  } catch (e) {
    notify(cloud ? cloud.cloudErrorMessage(e) : 'Could not load the cloud features. Check your connection and try again.', 'error', 8000);
  } finally {
    sync.busy = false;
  }
}

// ---------------------------------------------------------------- automatic uploads

let timer = null;

/** The quizzes an automatic upload would send now. */
const waiting = () => library.quizzes.filter((q) => editedSinceUpload(q) && !autoBlocked(q));

function schedule(delay = AUTO_DELAY) {
  clearTimeout(timer);
  timer = null;
  if (waiting().length) timer = setTimeout(runAuto, delay);
}

async function runAuto(now = false) {
  timer = null;
  // Offline: try again when the connection is back.
  if (!navigator.onLine) return;
  if (sync.busy) return schedule();
  // Still being edited: wait for a pause.
  const latest = Math.max(0, ...waiting().map((q) => q.updated));
  if (!now && Date.now() - latest < AUTO_DELAY - 50) return schedule(AUTO_DELAY - (Date.now() - latest));
  let cloud;
  Object.assign(sync, { busy: true, background: true, done: 0, total: 0 });
  try {
    cloud = await import('./cloud.js');
    const user = await cloud.currentUser();
    if (!user) return;
    for (const entry of waiting()) await autoUpload(cloud, user, entry);
    sync.error = '';
  } catch (e) {
    const message = cloud ? cloud.cloudErrorMessage(e) : 'Could not load the cloud features.';
    if (!sync.error) notify(`Could not upload the changes automatically: ${message} Moodler tries again after the next change.`, 'warning', 8000);
    sync.error = message;
  } finally {
    Object.assign(sync, { busy: false, background: false });
  }
}

async function autoUpload(cloud, user, entry) {
  const prepared = await quizForUpload(entry.id);
  if (!prepared) return;
  const { id, text, name, count, updated } = prepared;
  const version = entry.cloudVersion;
  const existing = await cloud.getCloudQuiz(user.uid, id);
  if (!existing || existing.deleted || existing.version !== version) {
    // Never replace a copy this browser hasn't seen, or bring one back from the trash, without asking.
    sync.blocked[id] = version;
    const why = !existing ? 'is no longer in the cloud' : existing.deleted ? 'is in the trash' : 'was changed on another device';
    notify(`The cloud copy of “${name}” ${why}, so its changes weren't uploaded automatically. Use Upload changes to choose what to do.`, 'warning', 10000);
    return;
  }
  const meta = await cloud.uploadCloudQuiz(user.uid, id, text, { name, count, folder: null, search: cloud.searchText(JSON.parse(text)), auto: true }, (done, total) => Object.assign(sync, { done, total }));
  markCloudSynced(id, meta.version, updated);
}

/** Starts uploading changes automatically while the app runs. Call once. */
export function startAutoUpload() {
  const stop = $effect.root(() => {
    $effect(() => {
      // Runs again whenever a quiz in the cloud is edited or uploaded.
      for (const q of library.quizzes) void (q.updated, q.cloudUpdated, q.cloudVersion);
      void Object.keys(sync.blocked).length;
      schedule();
    });
  });
  const online = () => schedule(1000);
  // Upload what is waiting before the page is left, if there is time.
  const hidden = () => document.visibilityState === 'hidden' && timer && (clearTimeout(timer), runAuto(true));
  addEventListener('online', online);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    stop();
    clearTimeout(timer);
    removeEventListener('online', online);
    document.removeEventListener('visibilitychange', hidden);
  };
}
