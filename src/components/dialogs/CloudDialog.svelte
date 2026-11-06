<script>
  import { onMount, tick } from 'svelte';
  import { Cloud, CloudUpload, CloudDownload, LogIn, LogOut, Trash2, Folder, FolderPlus, FolderInput, Pencil, ChevronRight, Check, X } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import { app, library, closeModal, notify, ask, prepareCloudUpload, markCloudSynced, applyCloudQuiz } from '../../lib/store.svelte.js';
  import {
    watchUser,
    signIn,
    signOut,
    listCloudQuizzes,
    listCloudFolders,
    uploadCloudQuiz,
    downloadCloudQuiz,
    deleteCloudQuiz,
    createCloudFolder,
    updateCloudFolder,
    moveCloudQuiz,
    deleteCloudFolders,
    folderPath,
    childFolders,
    folderTreeIds,
    folderOptions,
    cloudErrorMessage,
  } from '../../lib/cloud.js';

  let ready = $state(false);
  let user = $state(null);
  let quizzes = $state(null);
  let folders = $state([]);
  // The folder being shown; null is the top level.
  let current = $state(null);
  let error = $state('');
  // What is running: { label, done, total }, where total is 0 until the number of parts is known.
  let busy = $state(null);
  let primary = $state(null);
  // The name being typed: { id, name }, with id null for a new folder.
  let naming = $state(null);
  // The item being moved: { kind: 'quiz' | 'folder', id, target }, with target '' for the top level.
  let moving = $state(null);

  const progressText = $derived(busy ? (busy.total > 1 ? `${busy.label} ${busy.done} / ${busy.total}…` : `${busy.label}…`) : '');
  const openCopy = $derived(quizzes?.find((q) => q.id === library.activeId));
  const crumbs = $derived(folderPath(folders, current));
  const shownFolders = $derived(childFolders(folders, current));
  // A quiz whose folder was deleted on another device shows at the top level.
  const folderOf = (q) => (folders.some((f) => f.id === q.folder) ? q.folder : null);
  const shownQuizzes = $derived(quizzes?.filter((q) => folderOf(q) === current) ?? []);
  const uploadLabel = $derived(openCopy ? 'Upload again' : current ? `Upload to ${crumbs.at(-1)?.name}` : 'Upload this quiz');
  const moveOptions = $derived(moving ? folderOptions(folders, moving.kind === 'folder' ? moving.id : null) : []);

  const quizzesIn = (ids) => (quizzes ?? []).filter((q) => ids.includes(folderOf(q)));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const quizCount = (n) => (n === 1 ? '1 quiz' : `${n} quizzes`);
  const pathText = (id) => folderPath(folders, id).map((f) => f.name).join(' / ') || 'the top level';

  async function run(label, fn) {
    error = '';
    busy = { label, done: 0, total: 0 };
    try {
      await fn();
    } catch (e) {
      error = cloudErrorMessage(e);
    } finally {
      busy = null;
      // Disabling the button that was clicked drops the focus, and without it Escape no longer reaches the dialog.
      await tick();
      if (document.activeElement === document.body) primary?.focus();
    }
  }

  const progress = (done, total) => {
    if (busy) Object.assign(busy, { done, total });
  };

  async function refresh() {
    [quizzes, folders] = await Promise.all([listCloudQuizzes(user.uid), listCloudFolders(user.uid)]);
    if (current && !folders.some((f) => f.id === current)) current = null;
  }

  /** Shows the folder holding the open quiz's cloud copy. */
  function showOpenCopy() {
    if (openCopy) current = folderOf(openCopy);
  }

  onMount(() => {
    let stop = null;
    let gone = false;
    watchUser((u) => {
      user = u;
      ready = true;
      quizzes = null;
      folders = [];
      current = null;
      naming = moving = null;
      if (u) {
        run('Loading', async () => {
          await refresh();
          showOpenCopy();
        });
      }
    })
      .then((off) => (gone ? off() : (stop = off)))
      .catch((e) => {
        ready = true;
        error = cloudErrorMessage(e);
      });
    return () => {
      gone = true;
      stop?.();
    };
  });

  const close = () => !busy && closeModal();

  const login = () => run('Signing in', signIn);
  const logout = () => run('Signing out', signOut);

  function open(id) {
    current = id;
    naming = moving = null;
    error = '';
  }

  function upload() {
    return run('Uploading', async () => {
      await refresh();
      const { id, text, name, count, entry } = prepareCloudUpload();
      const existing = quizzes.find((q) => q.id === id);
      if (existing && existing.version !== entry.cloudVersion) {
        const ok = await ask({
          title: 'Replace the cloud copy?',
          message: `The cloud copy of “${existing.name}” (uploaded ${when(existing.uploaded)}) isn't the one this browser last synced with, so it may have changes this browser doesn't have. Uploading replaces it.`,
          confirmLabel: 'Replace',
          danger: true,
        });
        if (!ok) return;
      }
      const meta = await uploadCloudQuiz(user.uid, id, text, { name, count, folder: current }, progress);
      markCloudSynced(id, meta.version, entry.updated);
      await refresh();
      showOpenCopy();
      notify(`Uploaded “${name}” to ${pathText(folderOf(meta))}.`, 'success');
    });
  }

  function download(meta) {
    return run('Downloading', async () => {
      const local = library.quizzes.find((q) => q.id === meta.id);
      if (local && statusOf(meta) !== 'same') {
        const ok = await ask({
          title: 'Replace this browser’s copy?',
          message: `“${local.name}” in this browser will be replaced by the cloud copy from ${when(meta.uploaded)}. You can go back with Undo (Ctrl+Z).`,
          confirmLabel: 'Replace',
        });
        if (!ok) return;
      }
      const text = await downloadCloudQuiz(user.uid, meta, progress);
      if (!(await applyCloudQuiz(meta, text))) throw new Error('This cloud copy could not be read.');
      notify(`Downloaded “${meta.name}”.`, 'success');
      closeModal();
    });
  }

  async function removeQuiz(meta) {
    const ok = await ask({
      title: 'Delete the cloud copy?',
      message: `“${meta.name}” will be permanently deleted from your cloud list. Copies in your browsers are kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await run('Deleting', async () => {
      await deleteCloudQuiz(user.uid, meta);
      await refresh();
    });
  }

  async function removeFolder(folder) {
    const ids = folderTreeIds(folders, folder.id);
    const inside = quizzesIn(ids);
    const parts = [ids.length > 1 && plural(ids.length - 1, 'subfolder'), inside.length && quizCount(inside.length)].filter(Boolean);
    const ok = await ask({
      title: 'Delete the folder?',
      message: parts.length
        ? `“${folder.name}” and everything in it (${parts.join(' and ')}) will be permanently deleted from your cloud list. Copies in your browsers are kept.`
        : `The empty folder “${folder.name}” will be deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await run('Deleting', async () => {
      await deleteCloudFolders(user.uid, ids, inside, progress);
      await refresh();
    });
  }

  /** An error message when a folder inside `parent` can't have this name, because another one there does. */
  function nameClash(name, parent, exceptId) {
    const clash = childFolders(folders, parent).find((f) => f.id !== exceptId && f.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0);
    return clash ? `There is already a folder named “${clash.name}” ${parent ? `in ${pathText(parent)}` : 'at the top level'}.` : '';
  }

  function saveName(e) {
    e.preventDefault();
    const { id, name: typed } = naming;
    const name = typed.trim();
    if (!name) return;
    const parent = id ? folders.find((f) => f.id === id).parent : current;
    const clash = nameClash(name, parent, id);
    if (clash) {
      error = clash;
      return;
    }
    run(id ? 'Renaming' : 'Creating folder', async () => {
      if (id) await updateCloudFolder(user.uid, id, { name });
      else await createCloudFolder(user.uid, name, current);
      await refresh();
      naming = null;
    });
  }

  function saveMove() {
    const { kind, id, target } = moving;
    const parent = target || null;
    if (kind === 'folder') {
      const clash = nameClash(folders.find((f) => f.id === id).name, parent, id);
      if (clash) {
        error = clash;
        return;
      }
    }
    run('Moving', async () => {
      if (kind === 'folder') await updateCloudFolder(user.uid, id, { parent });
      else await moveCloudQuiz(user.uid, id, parent);
      await refresh();
      moving = null;
    });
  }

  function startNaming(id, name) {
    naming = { id, name };
    moving = null;
    error = '';
  }

  function startMoving(kind, id, from) {
    moving = { kind, id, target: from ?? '' };
    naming = null;
    error = '';
  }

  const movingFrom = () => (moving.kind === 'folder' ? folders.find((f) => f.id === moving.id)?.parent : folderOf(quizzes.find((q) => q.id === moving.id))) ?? '';

  function cancelNaming() {
    naming = null;
    error = '';
  }

  function cancelMoving() {
    moving = null;
    error = '';
  }

  function cancelOnEscape(e, cancel) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    cancel();
    primary?.focus();
  }

  /** How a cloud copy relates to this browser's quiz with the same ID. */
  function statusOf(meta) {
    const local = library.quizzes.find((q) => q.id === meta.id);
    if (!local) return 'absent';
    if (local.cloudVersion !== meta.version) return 'different';
    return local.updated === local.cloudUpdated ? 'same' : 'edited';
  }

  const STATUS = {
    absent: 'Not in this browser',
    different: 'Differs from this browser',
    same: 'Up to date',
    edited: 'Edited here since upload',
  };

  const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const sizeText = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const focusOnMount = (el) => {
    el.focus();
    el.select?.();
  };
</script>

{#snippet moveRow()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="inline" onkeydown={(e) => cancelOnEscape(e, cancelMoving)}>
    <label class="move-label" for="cloud-move-target">Move to</label>
    <select id="cloud-move-target" class="input" bind:value={moving.target} use:focusOnMount>
      <option value="">Cloud (top level)</option>
      {#each moveOptions as o (o.id)}
        <option value={o.id}>{'   '.repeat(o.depth + 1)}{o.name}</option>
      {/each}
    </select>
    <button class="btn btn-sm btn-primary" disabled={!!busy || moving.target === movingFrom()} onclick={saveMove}>Move</button>
    <button class="btn btn-sm" disabled={!!busy} onclick={cancelMoving}>Cancel</button>
  </div>
{/snippet}

{#snippet nameRow(label)}
  <form class="inline" onsubmit={saveName} onkeydown={(e) => cancelOnEscape(e, cancelNaming)}>
    <input class="input" aria-label={label} placeholder="Folder name" maxlength="100" bind:value={naming.name} use:focusOnMount />
    <button class="btn btn-ghost btn-icon" type="submit" title="Save" aria-label="Save" disabled={!!busy || !naming.name.trim()}><Check size={16} /></button>
    <button class="btn btn-ghost btn-icon" type="button" title="Cancel" aria-label="Cancel" disabled={!!busy} onclick={cancelNaming}><X size={16} /></button>
  </form>
{/snippet}

<Modal title="Cloud" subtitle="Upload quizzes to your private Firebase folders and download them on any device." width="680px" onclose={close}>
  {#if !ready}
    <p class="note">Connecting…</p>
  {:else if !user}
    <p class="note">Sign in with Google to keep private copies of your quizzes. Only your account can read them. Your work stays in this browser too, and nothing is uploaded until you choose to.</p>
  {:else}
    <div class="account">
      <span class="who" title={user.email}>Signed in as <strong>{user.email}</strong></span>
      <button class="btn btn-ghost btn-sm" disabled={!!busy} onclick={logout}><LogOut size={14} /> Sign out</button>
    </div>

    {#if quizzes}
      <div class="bar">
        <nav class="crumbs" aria-label="Folder path">
          <button class="crumb" aria-current={current ? undefined : 'page'} onclick={() => open(null)}><Cloud size={14} /> Cloud</button>
          {#each crumbs as c, i (c.id)}
            <ChevronRight size={13} class="sep" />
            <button class="crumb" aria-current={i === crumbs.length - 1 ? 'page' : undefined} title={c.name} onclick={() => open(c.id)}>{c.name}</button>
          {/each}
        </nav>
        <button class="btn btn-sm" disabled={!!busy} onclick={() => startNaming(null, '')}><FolderPlus size={15} /> New folder</button>
      </div>

      <ul class="list">
        {#if naming && !naming.id}
          <li class="item">{@render nameRow('New folder name')}</li>
        {/if}
        {#each shownFolders as f (f.id)}
          {@const count = quizzesIn(folderTreeIds(folders, f.id)).length}
          <li class="item folder">
            {#if naming?.id === f.id}
              {@render nameRow(`New name for ${f.name}`)}
            {:else}
              <button class="open-folder" title="Open {f.name}" onclick={() => open(f.id)}>
                <Folder size={18} />
                <span class="info">
                  <span class="name">{f.name}</span>
                  <span class="meta">{quizCount(count)}</span>
                </span>
              </button>
              <button class="btn btn-ghost btn-icon" title="Rename" aria-label="Rename {f.name}" disabled={!!busy} onclick={() => startNaming(f.id, f.name)}><Pencil size={15} /></button>
              <button class="btn btn-ghost btn-icon" title="Move to another folder" aria-label="Move {f.name}" disabled={!!busy} onclick={() => startMoving('folder', f.id, f.parent)}><FolderInput size={15} /></button>
              <button class="btn btn-ghost btn-icon danger" title="Delete the folder" aria-label="Delete the folder {f.name}" disabled={!!busy} onclick={() => removeFolder(f)}><Trash2 size={15} /></button>
            {/if}
            {#if moving?.id === f.id}{@render moveRow()}{/if}
          </li>
        {/each}
        {#each shownQuizzes as q (q.id)}
          <li class="item" class:open={q.id === library.activeId}>
            <div class="info">
              <span class="name" title={q.name}>{q.name}</span>
              <span class="meta">{plural(q.count, 'question')} · {sizeText(q.size)} · {when(q.uploaded)}</span>
              <span class="state {statusOf(q)}">{STATUS[statusOf(q)]}</span>
            </div>
            <button class="btn btn-sm" disabled={!!busy} onclick={() => download(q)}><CloudDownload size={15} /> Download</button>
            <button class="btn btn-ghost btn-icon" title="Move to another folder" aria-label="Move {q.name}" disabled={!!busy} onclick={() => startMoving('quiz', q.id, folderOf(q))}><FolderInput size={15} /></button>
            <button class="btn btn-ghost btn-icon danger" title="Delete the cloud copy" aria-label="Delete the cloud copy of {q.name}" disabled={!!busy} onclick={() => removeQuiz(q)}><Trash2 size={15} /></button>
            {#if moving?.id === q.id}{@render moveRow()}{/if}
          </li>
        {/each}
        {#if !shownFolders.length && !shownQuizzes.length && !naming}
          <li class="note empty">{current ? 'This folder is empty.' : 'Nothing uploaded yet. Upload the open quiz to see it here.'}</li>
        {/if}
      </ul>
    {/if}
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    {#if progressText}<span class="progress" role="status">{progressText}</span>{/if}
    <button class="btn" disabled={!!busy} onclick={close}>Close</button>
    {#if user}
      <button class="btn btn-primary upload" bind:this={primary} disabled={!!busy || !quizzes || !app.quiz.questions.length} title={app.quiz.questions.length ? uploadLabel : 'This quiz has no questions yet'} onclick={upload}>
        <CloudUpload size={16} /> <span class="upload-text">{uploadLabel}</span>
      </button>
    {:else}
      <button class="btn btn-primary" bind:this={primary} disabled={!ready || !!busy} onclick={login}><LogIn size={16} /> Sign in with Google</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .note {
    margin: 0;
    color: var(--text-2);
  }
  .empty {
    padding: 14px 2px;
  }
  .account,
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .who {
    min-width: 0;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumbs {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    color: var(--text-3);
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 180px;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-2);
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb:hover {
    background: var(--hover);
  }
  .crumb[aria-current='page'] {
    color: var(--text);
    font-weight: 600;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 50vh;
    overflow: auto;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 9px 8px 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .item.open {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--accent-soft);
  }
  .item.folder:hover {
    background: var(--hover);
  }
  .open-folder {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta,
  .state {
    font-size: 12px;
    color: var(--text-3);
  }
  .state.same {
    color: var(--success);
  }
  .state.different,
  .state.edited {
    color: var(--warning);
  }
  .danger:hover:not(:disabled) {
    color: var(--danger);
  }
  .inline {
    flex: 1 0 100%;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inline .input {
    flex: 1;
    min-width: 0;
  }
  .move-label {
    flex: none;
    font-size: 13px;
    color: var(--text-2);
  }
  .error {
    margin: 12px 0 0;
    color: var(--danger);
  }
  .progress {
    margin-right: auto;
    font-size: 13px;
    color: var(--text-3);
  }
  .upload {
    max-width: 300px;
  }
  .upload-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
