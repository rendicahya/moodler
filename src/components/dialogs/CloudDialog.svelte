<script>
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
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
  // The folder selected in the tree; null is the top level.
  let current = $state(null);
  const expanded = new SvelteSet();
  let tree = $state(null);
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
  const selected = $derived(crumbs.at(-1));
  // The rows the tree shows: the top level, then the folders whose parents are all expanded.
  const treeRows = $derived([
    { id: null, name: 'Cloud', parent: null, depth: 0, hasChildren: false },
    ...folderOptions(folders, null, (id) => expanded.has(id)).map((r) => ({ ...r, depth: r.depth + 1 })),
  ]);
  // A quiz whose folder was deleted on another device shows at the top level.
  const folderOf = (q) => (folders.some((f) => f.id === q.folder) ? q.folder : null);
  const shownQuizzes = $derived(quizzes?.filter((q) => folderOf(q) === current) ?? []);
  const quizzesPerFolder = $derived.by(() => {
    const counts = new Map();
    for (const q of quizzes ?? []) counts.set(folderOf(q), (counts.get(folderOf(q)) ?? 0) + 1);
    return counts;
  });
  const uploadLabel = $derived(openCopy ? 'Upload again' : selected ? `Upload to ${selected.name}` : 'Upload this quiz');
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
    reveal(current);
  }

  /** Expands the folders above this one, so that it has a row in the tree. */
  function reveal(id) {
    for (const f of folderPath(folders, id).slice(0, -1)) expanded.add(f.id);
  }

  function show(id) {
    current = id;
    reveal(id);
  }

  // Keeps the selected folder in sight, such as when the dialog opens at a folder far down a long tree.
  $effect(() => {
    void [current, treeRows];
    tick().then(() => tree?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }));
  });

  /** Selects the folder holding the open quiz's cloud copy. */
  function showOpenCopy() {
    if (openCopy) show(folderOf(openCopy));
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
      expanded.clear();
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
    // An upload that is running puts a first copy in the selected folder.
    if (busy) return;
    show(id);
    naming = moving = null;
    error = '';
  }

  function toggle(id) {
    if (busy) return;
    if (!expanded.delete(id)) expanded.add(id);
    // Collapsing the folder around the selected one would hide the selection, so it moves up to the collapsed folder.
    else if (current !== id && folderTreeIds(folders, id).includes(current)) open(id);
  }

  /** Arrow keys, Home and End in the tree, as in a file manager. */
  function treeKey(e) {
    const at = treeRows.findIndex((r) => r.id === current);
    const row = treeRows[at];
    let next;
    if (e.key === 'ArrowDown') next = treeRows[at + 1];
    else if (e.key === 'ArrowUp') next = treeRows[at - 1];
    else if (e.key === 'Home') next = treeRows[0];
    else if (e.key === 'End') next = treeRows.at(-1);
    else if (e.key === 'ArrowRight') {
      if (row.hasChildren && !expanded.has(row.id)) toggle(row.id);
      else if (row.hasChildren) next = treeRows[at + 1];
    } else if (e.key === 'ArrowLeft') {
      if (expanded.has(row.id)) toggle(row.id);
      else if (row.id) next = treeRows.find((r) => r.id === row.parent);
    } else return;
    e.preventDefault();
    if (!next) return;
    open(next.id);
    tick().then(() => tree?.querySelector('[tabindex="0"]')?.focus());
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
      current = folder.parent;
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
      const made = id ? null : await createCloudFolder(user.uid, name, current);
      await refresh();
      if (made) show(made);
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

{#snippet nameRow(label, placeholder)}
  <form class="inline" onsubmit={saveName} onkeydown={(e) => cancelOnEscape(e, cancelNaming)}>
    <input class="input" aria-label={label} {placeholder} maxlength="100" bind:value={naming.name} use:focusOnMount />
    <button class="btn btn-ghost btn-icon" type="submit" title="Save" aria-label="Save" disabled={!!busy || !naming.name.trim()}><Check size={16} /></button>
    <button class="btn btn-ghost btn-icon" type="button" title="Cancel" aria-label="Cancel" disabled={!!busy} onclick={cancelNaming}><X size={16} /></button>
  </form>
{/snippet}

<Modal title="Cloud" subtitle="Upload quizzes to your private Firebase folders and download them on any device." width="920px" onclose={close}>
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
      <div class="panes">
        <div class="tree" role="tree" aria-label="Folders" bind:this={tree}>
          {#each treeRows as r (r.id ?? 'top level')}
            {@const count = quizzesPerFolder.get(r.id)}
            <div
              class="row"
              class:selected={r.id === current}
              role="treeitem"
              aria-level={r.depth + 1}
              aria-selected={r.id === current}
              aria-expanded={r.hasChildren ? expanded.has(r.id) : undefined}
              tabindex={r.id === current ? 0 : -1}
              title={r.name}
              style:padding-left="{6 + Math.min(r.depth, 8) * 14}px"
              onclick={() => {
                open(r.id);
                if (r.hasChildren && !busy) expanded.add(r.id);
              }}
              onkeydown={treeKey}
            >
              {#if r.hasChildren}
                <!-- The arrow keys do this from the keyboard. -->
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class="twist"
                  class:open={expanded.has(r.id)}
                  aria-hidden="true"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggle(r.id);
                  }}><ChevronRight size={14} /></span>
              {:else if r.id}
                <span class="twist"></span>
              {/if}
              {#if r.id}<Folder size={15} />{:else}<Cloud size={15} />{/if}
              <span class="label">{r.name}</span>
              {#if count}<span class="count" title={quizCount(count)}>{count}</span>{/if}
            </div>
          {/each}
        </div>

        <section class="files" aria-label="Quizzes in the selected folder">
          <div class="bar">
            <nav class="crumbs" aria-label="Folder path">
              <button class="crumb" aria-current={current ? undefined : 'page'} onclick={() => open(null)}>Cloud</button>
              {#if crumbs.length > 3}
                <ChevronRight size={13} />
                <span class="crumb-gap" title={pathText(current)}>…</span>
              {/if}
              {#each crumbs.slice(-3) as c (c.id)}
                <ChevronRight size={13} />
                <button class="crumb" aria-current={c.id === current ? 'page' : undefined} title={c.name} onclick={() => open(c.id)}>{c.name}</button>
              {/each}
            </nav>
            <div class="actions">
              {#if selected}
                <button class="btn btn-ghost btn-icon" title="Rename the folder" aria-label="Rename {selected.name}" disabled={!!busy} onclick={() => startNaming(selected.id, selected.name)}><Pencil size={15} /></button>
                <button class="btn btn-ghost btn-icon" title="Move the folder" aria-label="Move {selected.name}" disabled={!!busy} onclick={() => startMoving('folder', selected.id, selected.parent)}><FolderInput size={15} /></button>
                <button class="btn btn-ghost btn-icon danger" title="Delete the folder" aria-label="Delete the folder {selected.name}" disabled={!!busy} onclick={() => removeFolder(selected)}><Trash2 size={15} /></button>
              {/if}
              <button class="btn btn-sm" disabled={!!busy} onclick={() => startNaming(null, '')}><FolderPlus size={15} /> New folder</button>
            </div>
            {#if naming}
              {@render nameRow(naming.id ? `New name for ${selected.name}` : 'New folder name', naming.id ? 'Folder name' : `New folder in ${selected?.name ?? 'Cloud'}`)}
            {/if}
            {#if moving?.kind === 'folder'}{@render moveRow()}{/if}
          </div>

          <ul class="list">
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
            {:else}
              <li class="note empty">{quizzes.length || folders.length ? 'No quizzes in this folder.' : 'Nothing uploaded yet. Upload the open quiz to see it here.'}</li>
            {/each}
          </ul>
        </section>
      </div>
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
    padding: 14px 4px;
  }
  .account,
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .account {
    margin-bottom: 12px;
  }
  .panes {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    height: min(58vh, 520px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .tree {
    min-height: 0;
    padding: 6px;
    overflow: auto;
    border-right: 1px solid var(--border);
    background: var(--surface-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    padding-right: 8px;
    border-radius: 6px;
    color: var(--text-2);
    cursor: pointer;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.selected {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 500;
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .twist {
    flex: none;
    width: 18px;
    display: inline-flex;
    justify-content: center;
    color: var(--text-3);
    transition: transform 0.1s;
  }
  .twist.open {
    transform: rotate(90deg);
  }
  .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    flex: none;
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
  }
  .files {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .bar {
    flex-wrap: wrap;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }
  .actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .actions .btn-sm {
    margin-left: 6px;
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
    align-items: center;
    gap: 2px;
    color: var(--text-3);
  }
  .crumbs :global(svg),
  .crumb-gap {
    flex: none;
  }
  .crumb {
    flex: 0 1 auto;
    min-width: 24px;
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
    flex-shrink: 0;
    max-width: 60%;
    color: var(--text);
    font-weight: 600;
  }
  .list {
    flex: 1;
    min-height: 0;
    list-style: none;
    margin: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
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
  @media (max-width: 640px) {
    .panes {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 35%) minmax(0, 1fr);
      height: 68vh;
    }
    .tree {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .crumbs,
    .info {
      flex: 1 0 100%;
    }
  }
</style>
