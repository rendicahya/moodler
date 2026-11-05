<script>
  import { onMount, tick } from 'svelte';
  import { CloudUpload, CloudDownload, LogIn, LogOut, Trash2 } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import { app, library, closeModal, notify, ask, prepareCloudUpload, markCloudSynced, applyCloudQuiz } from '../../lib/store.svelte.js';
  import { watchUser, signIn, signOut, listCloudQuizzes, uploadCloudQuiz, downloadCloudQuiz, deleteCloudQuiz, cloudErrorMessage } from '../../lib/cloud.js';

  let ready = $state(false);
  let user = $state(null);
  let quizzes = $state(null);
  let error = $state('');
  // What is running: { label, done, total }, where total is 0 until the number of parts is known.
  let busy = $state(null);
  let primary = $state(null);

  const progressText = $derived(busy ? (busy.total > 1 ? `${busy.label} ${busy.done} / ${busy.total}…` : `${busy.label}…`) : '');
  const openCopy = $derived(quizzes?.find((q) => q.id === library.activeId));

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

  const refresh = async () => {
    quizzes = await listCloudQuizzes(user.uid);
  };

  onMount(() => {
    let stop = null;
    let gone = false;
    watchUser((u) => {
      user = u;
      ready = true;
      quizzes = null;
      if (u) run('Loading', refresh);
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
      const meta = await uploadCloudQuiz(user.uid, id, text, { name, count }, progress);
      markCloudSynced(id, meta.version, entry.updated);
      await refresh();
      notify(`Uploaded “${name}”.`, 'success');
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

  async function remove(meta) {
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
</script>

<Modal title="Cloud" subtitle="Upload quizzes to your private Firebase list and download them on any device." width="620px" onclose={close}>
  {#if !ready}
    <p class="note">Connecting…</p>
  {:else if !user}
    <p class="note">Sign in with Google to keep private copies of your quizzes. Only your account can read them. Your work stays in this browser too, and nothing is uploaded until you choose to.</p>
  {:else}
    <div class="account">
      <span class="who" title={user.email}>Signed in as <strong>{user.email}</strong></span>
      <button class="btn btn-ghost btn-sm" disabled={!!busy} onclick={logout}><LogOut size={14} /> Sign out</button>
    </div>

    {#if quizzes?.length}
      <ul class="list">
        {#each quizzes as q (q.id)}
          <li class="item" class:open={q.id === library.activeId}>
            <div class="info">
              <span class="name" title={q.name}>{q.name}</span>
              <span class="meta">{q.count} question{q.count === 1 ? '' : 's'} · {sizeText(q.size)} · {when(q.uploaded)}</span>
              <span class="state {statusOf(q)}">{STATUS[statusOf(q)]}</span>
            </div>
            <button class="btn btn-sm" disabled={!!busy} onclick={() => download(q)}><CloudDownload size={15} /> Download</button>
            <button class="btn btn-ghost btn-icon danger" title="Delete the cloud copy" aria-label="Delete the cloud copy of {q.name}" disabled={!!busy} onclick={() => remove(q)}><Trash2 size={15} /></button>
          </li>
        {/each}
      </ul>
    {:else if quizzes}
      <p class="note">Nothing uploaded yet. Upload the open quiz to see it here.</p>
    {/if}
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    {#if progressText}<span class="progress" role="status">{progressText}</span>{/if}
    <button class="btn" disabled={!!busy} onclick={close}>Close</button>
    {#if user}
      <button class="btn btn-primary" bind:this={primary} disabled={!!busy || !quizzes || !app.quiz.questions.length} title={app.quiz.questions.length ? '' : 'This quiz has no questions yet'} onclick={upload}>
        <CloudUpload size={16} /> {openCopy ? 'Upload again' : 'Upload this quiz'}
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
  .account {
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
  .error {
    margin: 12px 0 0;
    color: var(--danger);
  }
  .progress {
    margin-right: auto;
    font-size: 13px;
    color: var(--text-3);
  }
</style>
