<script>
  import { FilePlus, Pencil, Copy, Trash, Search, Download, Upload, Check } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import { app, library, byRecent, closeModal, openModal, switchQuiz, newQuiz, duplicateQuiz, renameQuiz, deleteQuiz, downloadBackup } from '../../lib/store.svelte.js';

  let query = $state('');
  let editing = $state(null);
  let draft = $state('');

  // The open quiz first, then the others by when they were last changed.
  const rows = $derived(
    [...library.quizzes]
      .sort((a, b) => (a.id === library.activeId ? -1 : b.id === library.activeId ? 1 : byRecent(a, b)))
      .filter((q) => !query.trim() || q.name.toLowerCase().includes(query.trim().toLowerCase()))
  );

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  function ago(t) {
    const s = (t - Date.now()) / 1000;
    for (const [unit, size] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
    }
    return 'just now';
  }

  async function open(id) {
    if (editing) return;
    if (await switchQuiz(id)) closeModal();
  }

  function create() {
    closeModal();
    newQuiz();
  }

  function startRename(q) {
    editing = q.id;
    draft = q.name;
  }

  function finishRename(save) {
    if (save && editing) renameQuiz(editing, draft);
    editing = null;
  }

  function focusSelect(el) {
    el.focus();
    el.select();
  }
</script>

<Modal title="Your quizzes" subtitle="Every quiz is saved in this browser. Open one to edit it; the others stay as they are." width="640px" onclose={closeModal}>
  {#if library.quizzes.length > 6}
    <div class="search">
      <Search size={15} />
      <input class="input input-sm" placeholder="Search quizzes…" bind:value={query} aria-label="Search quizzes" />
    </div>
  {/if}

  <ul class="list">
    {#each rows as q (q.id)}
      {@const active = q.id === library.activeId}
      {@const count = active ? app.quiz.questions.length : q.count}
      <li class="row" class:active>
        {#if editing === q.id}
          <form class="rename" onsubmit={(e) => (e.preventDefault(), finishRename(true))}>
            <input
              class="input input-sm"
              bind:value={draft}
              aria-label="Quiz name"
              use:focusSelect
              onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), finishRename(false))}
              onblur={() => finishRename(true)}
            />
          </form>
        {:else}
          <button class="main" onclick={() => open(q.id)} title={active ? 'This quiz is open' : 'Open this quiz'} data-autofocus={active ? '' : undefined}>
            <span class="name">{active ? app.quiz.name || 'Untitled quiz' : q.name}</span>
            <span class="meta">
              {count} question{count === 1 ? '' : 's'} · changed {ago(q.updated)}
            </span>
          </button>
          {#if active}<span class="badge open"><Check size={12} /> Open</span>{/if}
          <span class="actions">
            <button class="btn btn-ghost btn-icon btn-sm" title="Rename" aria-label="Rename {q.name}" onclick={() => startRename(q)}><Pencil size={14} /></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Duplicate" aria-label="Duplicate {q.name}" onclick={() => duplicateQuiz(q.id)}><Copy size={14} /></button>
            <button class="btn btn-ghost btn-icon btn-sm danger" title="Delete" aria-label="Delete {q.name}" onclick={() => deleteQuiz(q.id)}><Trash size={14} /></button>
          </span>
        {/if}
      </li>
    {:else}
      <li class="empty">No quizzes match “{query}”.</li>
    {/each}
  </ul>

  {#snippet footer()}
    <div class="left">
      <button class="btn" title="Download every quiz in one file (.json) that can be imported again" onclick={downloadBackup}><Download size={16} /> Back up all</button>
      <button class="btn" title="Import questions (Ctrl+O)" onclick={() => openModal('import')}><Upload size={16} /> Import…</button>
    </div>
    <button class="btn btn-primary" title="New quiz (Alt+Shift+N)" onclick={create}><FilePlus size={16} /> New quiz</button>
  {/snippet}
</Modal>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search > :global(svg) {
    position: absolute;
    left: 9px;
    color: var(--text-3);
    pointer-events: none;
  }
  .search input {
    padding-left: 30px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 4px 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .row:hover {
    background: var(--hover);
  }
  .row.active {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--accent-soft);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 8px;
    border: none;
    border-radius: 6px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .main:focus-visible {
    box-shadow: var(--focus);
    outline: none;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 12px;
    color: var(--text-3);
  }
  .open {
    flex: none;
    gap: 3px;
    color: var(--accent);
  }
  .actions {
    flex: none;
    display: flex;
    gap: 2px;
  }
  .rename {
    flex: 1;
    padding: 4px;
  }
  .rename input {
    width: 100%;
  }
  .empty {
    padding: 16px;
    text-align: center;
    color: var(--text-3);
  }
  .left {
    display: flex;
    gap: 8px;
    margin-right: auto;
  }
  @media (max-width: 560px) {
    .open {
      display: none;
    }
  }
</style>
