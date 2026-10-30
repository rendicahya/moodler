<script>
  import { Plus, X, Pencil, Copy, Download } from '@lucide/svelte';
  import {
    app,
    library,
    switchQuiz,
    closeTab,
    moveTab,
    renameQuiz,
    duplicateQuiz,
    newQuiz,
    downloadBackup,
    transfer,
    endTransfer,
    transferQuestions,
  } from '../lib/store.svelte.js';

  let editing = $state(null);
  let draft = $state('');
  let dragId = $state(null);
  let dropAt = $state(null);
  let menu = $state(null);
  let strip;

  // The open quiz's name and count change as you type, before its list entry is refreshed.
  const nameOf = (t) => (t.id === library.activeId ? app.quiz.name || 'Untitled quiz' : t.name);
  const countOf = (t) => (t.id === library.activeId ? app.quiz.questions.length : t.count);
  // An empty quiz that is the only tab has nothing to close.
  const closable = (t) => library.quizzes.length > 1 || countOf(t) > 0;

  // Keep the open tab in view when switching with the keyboard.
  $effect(() => {
    library.activeId;
    queueMicrotask(() => strip?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  });

  function startRename(t) {
    editing = t.id;
    draft = nameOf(t);
  }
  function finishRename(save) {
    if (save && editing) renameQuiz(editing, draft);
    editing = null;
  }
  function focusSelect(el) {
    el.focus();
    el.select();
  }

  function onauxclick(e, t) {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(t.id);
    }
  }

  function oncontextmenu(e, t) {
    e.preventDefault();
    menu = { tab: t, x: Math.min(e.clientX, window.innerWidth - 220), y: e.clientY };
  }
  function run(fn) {
    const t = menu.tab;
    menu = null;
    fn(t);
  }

  function ondragstart(e, t) {
    dragId = t.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.name);
  }
  function ondragover(e, i, t) {
    if (transfer.from) return overWithQuestions(e, t);
    if (!dragId) return;
    e.preventDefault();
    dropAt = i;
  }
  function ondrop(e, i, t) {
    if (transfer.from) return dropQuestions(e, t);
    if (!dragId) return;
    e.preventDefault();
    moveTab(dragId, i);
    dragId = dropAt = null;
  }

  // Questions dragged from the list: dropping them on a tab moves them to the end of that quiz (Ctrl copies);
  // holding them over a tab for a moment opens it, so they can be dropped at a chosen place in its list.
  let hoverId = $state(null);
  let hoverTimer;
  const copying = (e) => e.ctrlKey || e.altKey;

  function hover(id) {
    if (hoverId === id) return;
    clearTimeout(hoverTimer);
    hoverId = id;
    if (id && id !== library.activeId) hoverTimer = setTimeout(() => hoverId === id && transfer.from && switchQuiz(id), 700);
  }
  function overWithQuestions(e, t) {
    hover(t.id);
    if (t.id === transfer.from) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = copying(e) ? 'copy' : 'move';
  }
  function dropQuestions(e, t) {
    e.preventDefault();
    const { from, ids } = transfer;
    endTransfer();
    hover(null);
    if (t.id !== from) transferQuestions(from, t.id, [...ids], { copy: copying(e) });
  }
  function leave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) hover(null);
  }
  $effect(() => {
    if (!transfer.from) hover(null);
  });

  function onwheel(e) {
    // Let a normal mouse wheel scroll the tabs sideways.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && strip.scrollWidth > strip.clientWidth) {
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    }
  }
</script>

<svelte:window
  onpointerdown={(e) => menu && !e.target.closest?.('.menu') && (menu = null)}
  ondrop={() => transfer.from && endTransfer()}
  ondragend={() => transfer.from && endTransfer()}
  onpointermove={() => transfer.from && endTransfer()}
  onkeydown={(e) => menu && e.key === 'Escape' && (e.stopPropagation(), (menu = null))}
  onblur={() => (menu = null)}
/>

<nav class="tabbar" aria-label="Quizzes">
  <div class="strip" role="tablist" bind:this={strip} {onwheel}>
    {#each library.quizzes as t, i (t.id)}
      {@const active = t.id === library.activeId}
      {@const count = countOf(t)}
      <div
        class="tab"
        class:active
        class:dragging={dragId === t.id}
        class:drop={dropAt === i && dragId !== t.id}
        class:target={transfer.from && hoverId === t.id && t.id !== transfer.from}
        role="presentation"
        draggable={editing !== t.id}
        ondragstart={(e) => ondragstart(e, t)}
        ondragover={(e) => ondragover(e, i, t)}
        ondragleave={leave}
        ondrop={(e) => ondrop(e, i, t)}
        ondragend={() => (dragId = dropAt = null)}
        onauxclick={(e) => onauxclick(e, t)}
        oncontextmenu={(e) => oncontextmenu(e, t)}
      >
        {#if editing === t.id}
          <form onsubmit={(e) => (e.preventDefault(), finishRename(true))}>
            <input
              class="rename"
              bind:value={draft}
              aria-label="Quiz name"
              use:focusSelect
              onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), finishRename(false))}
              onblur={() => finishRename(true)}
            />
          </form>
        {:else}
          <button
            class="label"
            role="tab"
            aria-selected={active}
            title="{nameOf(t)} · {count} question{count === 1 ? '' : 's'}{i < 9 ? ` (Alt+${i + 1})` : ''}{'\n'}Double-click to rename, right-click for more"
            onclick={() => switchQuiz(t.id)}
            ondblclick={() => startRename(t)}
          >
            <span class="name">{nameOf(t)}</span>
            <span class="count">{count}</span>
          </button>
        {/if}
        {#if closable(t)}
          <button class="close" title="Close tab and remove this quiz (Alt+W)" aria-label="Close {nameOf(t)}" onclick={() => closeTab(t.id)}>
            <X size={13} />
          </button>
        {/if}
      </div>
    {/each}
    <button class="add" title="New quiz (Alt+Shift+N)" aria-label="New quiz" onclick={newQuiz}><Plus size={16} /></button>
  </div>
</nav>

{#if menu}
  <div class="menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
    <button role="menuitem" onclick={() => run(startRename)}><Pencil size={14} /> Rename</button>
    <button role="menuitem" onclick={() => run((t) => duplicateQuiz(t.id))}><Copy size={14} /> Duplicate</button>
    <button role="menuitem" onclick={() => run(() => downloadBackup())}><Download size={14} /> Back up all quizzes</button>
    {#if closable(menu.tab)}
      <hr />
      <button role="menuitem" class="danger" onclick={() => run((t) => closeTab(t.id))}><X size={14} /> Close and remove</button>
    {/if}
  </div>
{/if}

<style>
  /* The tabs sit in the header between the logo and the buttons, along its bottom edge. */
  .tabbar {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-end;
    align-self: stretch;
    /* Reach over the header's bottom border, so the open tab can cover it and join the page below. */
    margin-bottom: -1px;
    padding: 0 4px;
  }
  .strip {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .tab {
    position: relative;
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    min-width: 96px;
    max-width: 240px;
    height: 34px;
    margin-bottom: 1px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 7px 7px 0 0;
    color: var(--text-2);
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
    /* Cover the header's bottom border so the tab joins the page below. */
    margin-bottom: 0;
    height: 35px;
  }
  .tab.active::before {
    content: '';
    position: absolute;
    left: -1px;
    right: -1px;
    top: -1px;
    height: 2px;
    border-radius: 7px 7px 0 0;
    background: var(--accent);
  }
  .tab.dragging {
    opacity: 0.5;
  }
  .tab.drop {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .tab.target {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 10px 0 12px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .tab:has(.close) .label {
    padding-right: 4px;
  }
  .tab.active .label {
    font-weight: 600;
  }
  .label:focus-visible,
  .close:focus-visible,
  .add:focus-visible {
    outline: none;
    box-shadow: var(--focus);
  }
  .name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    flex: none;
    font-size: 11px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .tab.active .count {
    background: var(--accent-soft);
    color: var(--accent);
  }
  form {
    flex: 1;
    min-width: 0;
    padding: 0 4px 0 8px;
  }
  .rename {
    width: 100%;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .close,
  .add {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--text-3);
    cursor: pointer;
  }
  .close {
    width: 20px;
    height: 20px;
    margin-right: 5px;
    border-radius: 4px;
    opacity: 0;
  }
  .tab:hover .close,
  .tab.active .close,
  .close:focus-visible {
    opacity: 1;
  }
  .close:hover,
  .add:hover {
    background: var(--hover);
    color: var(--text);
  }
  .add {
    width: 28px;
    height: 28px;
    /* Centred on the tabs' labels, which sit along the bottom of the bar. */
    margin: 0 0 4px 2px;
    border-radius: 6px;
  }
  .menu {
    position: fixed;
    z-index: 50;
    min-width: 200px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.15));
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--hover);
    outline: none;
  }
  .menu .danger {
    color: var(--danger);
  }
  .menu hr {
    margin: 4px 0;
    border: none;
    border-top: 1px solid var(--border);
  }
  @media (hover: none) {
    .close {
      opacity: 1;
    }
  }
  @media (max-width: 560px) {
    .tab {
      min-width: 80px;
    }
  }
</style>
