<script>
  import { Plus, Search, GripVertical, Copy, Trash, TriangleAlert, X, Upload, EyeOff } from '@lucide/svelte';
  import { app, select, openModal, duplicateQuestion, deleteQuestion, moveQuestion } from '../lib/store.svelte.js';
  import { questionTitle, validateQuestion, TYPE_MAP, stripHtml } from '../lib/model.js';
  import { TYPE_ICONS } from '../lib/icons.js';
  import { createSortable } from '../lib/sortable.svelte.js';

  const sort = createSortable((from, to) => moveQuestion(from, to));

  const query = $derived(app.search.trim().toLowerCase());
  const rows = $derived(
    app.quiz.questions
      .map((q, i) => ({ q, i, issues: validateQuestion(q) }))
      .filter(({ q }) => {
        if (!query) return true;
        return (
          q.name.toLowerCase().includes(query) ||
          stripHtml(q.questiontext).toLowerCase().includes(query) ||
          TYPE_MAP[q.type].label.toLowerCase().includes(query) ||
          q.tags.some((t) => t.toLowerCase().includes(query))
        );
      })
  );
  const issueCount = $derived(rows.filter((r) => r.issues.length).length);

  function onkeydown(e, i) {
    const list = app.quiz.questions;
    if (e.altKey && e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      moveQuestion(i, i - 1);
    } else if (e.altKey && e.key === 'ArrowDown' && i < list.length - 1) {
      e.preventDefault();
      moveQuestion(i, i + 1);
    } else if (!e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const pos = rows.findIndex((r) => r.i === i) + (e.key === 'ArrowDown' ? 1 : -1);
      const target = rows[pos];
      if (target) {
        select(target.q.id);
        e.currentTarget.parentElement.querySelectorAll('.row')[pos]?.focus();
      }
    } else if (e.key === 'Delete') {
      deleteQuestion(list[i].id);
    }
  }
</script>

<aside class="sidebar">
  <div class="top">
    <div class="title-row">
      <h2>Questions <span class="count">{app.quiz.questions.length}</span></h2>
      {#if issueCount}
        <span class="badge warning" title="Questions with problems"><TriangleAlert size={12} /> {issueCount}</span>
      {/if}
    </div>
    <button class="btn btn-primary add" onclick={() => openModal('add')}><Plus size={16} /> Add question</button>
    {#if app.quiz.questions.length}
      <div class="search">
        <Search size={15} />
        <input class="input input-sm" placeholder="Search questions…" bind:value={app.search} aria-label="Search questions" />
        {#if app.search}
          <button class="btn btn-ghost btn-icon btn-sm clear" aria-label="Clear search" onclick={() => (app.search = '')}><X size={14} /></button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="list" role="listbox" aria-label="Questions">
    {#each rows as { q, i, issues } (q.id)}
      {@const Icon = TYPE_ICONS[q.type]}
      {@const ind = sort.indicator(i)}
      <div
        class="row"
        class:selected={q.id === app.selectedId}
        class:dragging={sort.dragging === i}
        class:drop-before={ind === 'before'}
        class:drop-after={ind === 'after'}
        role="option"
        aria-selected={q.id === app.selectedId}
        tabindex={q.id === app.selectedId ? 0 : -1}
        onclick={() => select(q.id)}
        onkeydown={(e) => onkeydown(e, i)}
        {...sort.item(i)}
      >
        {#if !query}
          <span class="drag-handle" title="Drag to reorder (or Alt+↑/↓)" {...sort.handle(i)}><GripVertical size={15} /></span>
        {/if}
        <span class="num">{i + 1}</span>
        <span class="type-icon" title={TYPE_MAP[q.type].label}><Icon size={15} /></span>
        <span class="body">
          <span class="name">{questionTitle(q)}</span>
          <span class="sub">
            {TYPE_MAP[q.type].label}
            {#if q.type !== 'description'}· {Number(q.defaultgrade)} mark{Number(q.defaultgrade) === 1 ? '' : 's'}{/if}
          </span>
        </span>
        {#if q.hidden}<span class="flag" title="Hidden"><EyeOff size={14} /></span>{/if}
        {#if issues.length}<span class="flag warn" title={issues.join('\n')}><TriangleAlert size={14} /></span>{/if}
        <span class="actions">
          <button class="btn btn-ghost btn-icon btn-sm" title="Duplicate" aria-label="Duplicate" onclick={(e) => (e.stopPropagation(), duplicateQuestion(q.id))}><Copy size={14} /></button>
          <button class="btn btn-ghost btn-icon btn-sm danger" title="Delete" aria-label="Delete" onclick={(e) => (e.stopPropagation(), deleteQuestion(q.id))}><Trash size={14} /></button>
        </span>
      </div>
    {:else}
      {#if app.quiz.questions.length}
        <p class="empty">No questions match “{app.search}”.</p>
      {:else}
        <div class="empty first">
          <p>No questions yet.</p>
          <button class="btn btn-sm" onclick={() => openModal('import')}><Upload size={14} /> Import from file</button>
        </div>
      {/if}
    {/each}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-w);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-right: 1px solid var(--border);
    min-height: 0;
  }
  .top {
    padding: 14px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--border);
  }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-2);
    letter-spacing: 0;
  }
  .add {
    width: 100%;
  }
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
    padding-right: 30px;
  }
  .clear {
    position: absolute;
    right: 2px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 4px;
    border-radius: var(--radius);
    cursor: pointer;
    border: 1px solid transparent;
    outline: none;
  }
  .row:hover {
    background: var(--hover);
  }
  .row:focus-visible {
    box-shadow: var(--focus);
  }
  .row.selected {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .row.dragging {
    opacity: 0.4;
  }
  .num {
    flex: none;
    width: 22px;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-3);
    font-weight: 500;
  }
  .type-icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--surface-3);
    color: var(--text-2);
  }
  .selected .type-icon {
    background: var(--accent);
    color: var(--on-accent);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 500;
    font-size: 13.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .flag {
    flex: none;
    display: inline-flex;
    color: var(--text-3);
  }
  .flag.warn {
    color: var(--warning);
  }
  .actions {
    display: none;
    gap: 2px;
    flex: none;
  }
  .row:hover .actions,
  .row:focus-within .actions {
    display: flex;
  }
  .row:hover .flag,
  .row:focus-within .flag {
    display: none;
  }
  .first {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding-top: 40px;
  }
</style>
