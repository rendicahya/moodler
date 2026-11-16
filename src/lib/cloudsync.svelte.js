// Uploading the open quiz's changes without opening the cloud dialog, for a quiz that is already in the cloud.

import { library, notify, ask, openModal, prepareCloudUpload, markCloudSynced } from './store.svelte.js';

export const sync = $state({ busy: false, done: 0, total: 0 });

/** Whether a quiz in this browser has been edited since it was last uploaded or downloaded. */
export const editedSinceUpload = (entry) => !!entry?.cloudVersion && entry.updated !== entry.cloudUpdated;

const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Uploads the open quiz over its cloud copy. Opens the cloud dialog when that needs a choice, such as signing in. */
export async function uploadChanges() {
  if (sync.busy) return;
  const entry = library.quizzes.find((q) => q.id === library.activeId);
  if (!entry?.cloudVersion) return openModal('cloud');
  Object.assign(sync, { busy: true, done: 0, total: 0 });
  let cloud;
  try {
    cloud = await import('./cloud.js');
    const user = await cloud.currentUser();
    if (!user) {
      notify('Sign in to upload this quiz.', 'info');
      return openModal('cloud');
    }
    const { id, text, name, count, entry: fresh } = prepareCloudUpload();
    // Read now: edits made while uploading change it, and those still need uploading afterwards.
    const updated = fresh.updated;
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
    notify(`Uploaded the changes to “${name}”.`, 'success', 3000);
  } catch (e) {
    notify(cloud ? cloud.cloudErrorMessage(e) : 'Could not load the cloud features. Check your connection and try again.', 'error', 8000);
  } finally {
    sync.busy = false;
  }
}
