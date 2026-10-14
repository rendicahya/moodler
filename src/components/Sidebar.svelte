<script>
  import { Plus, Search, GripVertical, Copy, Trash, TriangleAlert, X, Upload, EyeOff, SquarePen, ArrowUpToLine, ArrowDownToLine, Replace } from '@lucide/svelte';
  import {
    app,
    select,
    openModal,
    duplicateQuestion,
    deleteQuestion,
    moveQuestion,
    isChecked,
    setChecked,
    deleteChecked,
    duplicateChecked,
    moveChecked,
  } from '../lib/store.svelte.js';
  import { questionTitle, validateQuestion, TYPE_MAP, QUESTION_TYPES, stripHtml } from '../lib/model.js';
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
  const typeCounts = $derived(
    QUESTION_TYPES.map((t) => ({ ...t, count: app.quiz.questions.filter((q) => q.type === t.type).length })).filter((t) => t.count)
  );

  // Keep the open question visible in the list when it changes from elsewhere (Next/Previous, jump menu, shortcuts).
  let listEl = $state();
  $effect(() => {
    app.selectedId;
    listEl?.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
  });

  // Ticking applies to the rows currently shown, so a search narrows what "select all" picks.
  const visibleIds = $derived(rows.map((r) => r.q.id));
  const checkedVisible = $derived(visibleIds.filter((id) => app.checked.includes(id)).length);
  const allChecked = $derived(visibleIds.length > 0 && checkedVisible === visibleIds.length);
  // Start of a Shift range: the last row ticked or unticked, or else the open question.
  let anchor = $state(null);

  function checkAll(on) {
    if (on) app.checked = [...new Set([...app.checked, ...visibleIds])];
    else app.checked = app.checked.filter((id) => !visibleIds.includes(id));
  }

  /** Ticks every visible row between the anchor and the given row. */
  function checkRange(id) {
    const from = visibleIds.indexOf(anchor ?? app.selectedId);
    const to = visibleIds.indexOf(id);
    if (from === -1) return setChecked(id, true);
    const [a, b] = from < to ? [from, to] : [to, from];
    app.checked = [...new Set([...app.checked, ...visibleIds.slice(a, b + 1)])];
  }

  function toggle(id, e) {
    if (e?.shiftKey) checkRange(id);
    else setChecked(id, !isChecked(id));
    anchor = id;
  }

  function onrowclick(e, id) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) toggle(id, e);
    else select(id);
  }

  function onkeydown(e, i) {
    const list = app.quiz.questions;
    const id = list[i].id;
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
        // Shift+arrow extends the ticked range, like selecting rows in a file manager.
        if (e.shiftKey) {
          if (!app.checked.length) setChecked(id, true);
          setChecked(target.q.id, true);
          anchor = target.q.id;
        }
        select(target.q.id);
        e.currentTarget.parentElement.querySelectorAll('.row')[pos]?.focus();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      toggle(id);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      checkAll(true);
    } else if (e.key === 'Escape' && app.checked.length) {
      app.checked = [];
    } else if (e.key === 'Delete') {
      if (app.checked.length) deleteChecked();
      else deleteQuestion(id);
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
    {#if typeCounts.length}
      <ul class="types" aria-label="Questions by type">
        {#each typeCounts as t (t.type)}
          {@const Icon = TYPE_ICONS[t.type]}
          <li class="type-count" title="{t.count} {t.label}">
            <Icon size={13} />
            <span class="type-short">{t.short}</span>
            <span class="type-num">{t.count}</span>
          </li>
        {/each}
      </ul>
    {/if}
    <button class="btn btn-primary add" onclick={() => openModal('add')}><Plus size={16} /> Add question</button>
    {#if app.quiz.questions.length}
      <div class="search-row">
        <div class="search">
          <Search size={15} />
          <input class="input input-sm" placeholder="Search questions…" bind:value={app.search} aria-label="Search questions" />
          {#if app.search}
            <button class="btn btn-ghost btn-icon btn-sm clear" aria-label="Clear search" onclick={() => (app.search = '')}><X size={14} /></button>
          {/if}
        </div>
        <button class="btn btn-icon btn-sm" title="Find and replace (Ctrl+H)" aria-label="Find and replace" onclick={() => openModal('find')}><Replace size={15} /></button>
      </div>
    {/if}
  </div>

  {#if app.checked.length}
    <div class="bulk" role="toolbar" aria-label="Actions for selected questions">
      <div class="bulk-head">
        <label class="bulk-all" title={allChecked ? 'Clear selection' : 'Select all shown questions (Ctrl+A)'}>
          <input type="checkbox" checked={allChecked} indeterminate={checkedVisible > 0 && !allChecked} onchange={() => checkAll(!allChecked)} />
          <strong>{app.checked.length}</strong> selected
        </label>
        <button class="btn btn-ghost btn-sm" title="Clear selection (Esc)" onclick={() => (app.checked = [])}>Clear</button>
      </div>
      <div class="bulk-actions">
        <button class="btn btn-sm" title="Export the selected questions" onclick={() => openModal('export')}><Upload size={14} /> Export</button>
        <button class="btn btn-sm" title="Change mark, penalty, tags, category or visibility" onclick={() => openModal('bulk')}><SquarePen size={14} /> Edit</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-icon btn-sm" title="Move to top" aria-label="Move to top" onclick={() => moveChecked('top')}><ArrowUpToLine size={15} /></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Move to bottom" aria-label="Move to bottom" onclick={() => moveChecked('bottom')}><ArrowDownToLine size={15} /></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Duplicate" aria-label="Duplicate selected" onclick={duplicateChecked}><Copy size={15} /></button>
        <button class="btn btn-ghost btn-icon btn-sm danger" title="Delete (Del)" aria-label="Delete selected" onclick={deleteChecked}><Trash size={15} /></button>
      </div>
    </div>
  {/if}

  <div class="list" bind:this={listEl} class:selecting={app.checked.length > 0} role="listbox" aria-label="Questions" aria-multiselectable="true">
    {#each rows as { q, i, issues } (q.id)}
      {@const Icon = TYPE_ICONS[q.type]}
      {@const ind = sort.indicator(i)}
      {@const ticked = app.checked.includes(q.id)}
      <div
        class="row"
        class:selected={q.id === app.selectedId}
        class:ticked
        class:dragging={sort.dragging === i}
        class:drop-before={ind === 'before'}
        class:drop-after={ind === 'after'}
        role="option"
        aria-selected={ticked}
        aria-current={q.id === app.selectedId ? 'true' : undefined}
        tabindex={q.id === app.selectedId ? 0 : -1}
        onclick={(e) => onrowclick(e, q.id)}
        onmousedown={(e) => e.shiftKey && e.preventDefault()}
        onkeydown={(e) => onkeydown(e, i)}
        {...sort.item(i)}
      >
        {#if !query}
          <span class="drag-handle" title="Drag to reorder (or Alt+↑/↓)" {...sort.handle(i)}><GripVertical size={15} /></span>
        {/if}
        <!-- The number turns into a checkbox on hover, or for every row once any question is ticked. -->
        <span class="num-slot">
          <span class="num">{i + 1}</span>
          <input
            class="tick"
            type="checkbox"
            tabindex="-1"
            checked={ticked}
            title="Select (Ctrl+click, Shift+click for a range)"
            aria-label="Select question {i + 1}"
            onclick={(e) => (e.stopPropagation(), toggle(q.id, e))}
          />
        </span>
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
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: -2px 0 0;
    padding: 0;
    list-style: none;
  }
  .type-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-2);
    cursor: default;
  }
  .type-count :global(svg) {
    color: var(--text-3);
  }
  .type-short {
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .type-num {
    font-variant-numeric: tabular-nums;
  }
  .add {
    width: 100%;
  }
  .search-row {
    display: flex;
    gap: 6px;
  }
  .search {
    flex: 1;
    min-width: 0;
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
  .num-slot {
    flex: none;
    width: 22px;
    display: inline-flex;
    justify-content: flex-end;
  }
  .num {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-3);
    font-weight: 500;
  }
  .tick {
    display: none;
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .row:hover .tick,
  .selecting .tick {
    display: block;
  }
  .row:hover .num,
  .selecting .num {
    display: none;
  }
  .row.ticked:not(.selected) {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }
  .bulk {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--accent-soft);
  }
  .bulk-head,
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .bulk-head {
    justify-content: space-between;
  }
  .bulk-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .bulk-all input {
    accent-color: var(--accent);
    margin: 0;
  }
  .spacer {
    flex: 1;
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
