<script>
  import { Plus, X, LayoutList } from '@lucide/svelte';
  import { app, library, openTabs, switchQuiz, closeTab, moveTab, renameQuiz, newQuiz, openModal } from '../lib/store.svelte.js';

  const tabs = $derived(openTabs());
  const hidden = $derived(library.quizzes.length - tabs.length);

  let editing = $state(null);
  let draft = $state('');
  let dragId = $state(null);
  let dropAt = $state(null);
  let strip;

  // The open quiz's name and count change as you type, before its list entry is refreshed.
  const nameOf = (t) => (t.id === library.activeId ? app.quiz.name || 'Untitled quiz' : t.name);
  const countOf = (t) => (t.id === library.activeId ? app.quiz.questions.length : t.count);

  // Keep the open tab in view when switching with the keyboard or the quiz list.
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

  function ondragstart(e, t) {
    dragId = t.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.name);
  }
  function ondragover(e, i) {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    dropAt = i;
  }
  function ondrop(e, i) {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    moveTab(dragId, i);
    dragId = dropAt = null;
  }

  function onwheel(e) {
    // Let a normal mouse wheel scroll the tabs sideways.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && strip.scrollWidth > strip.clientWidth) {
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    }
  }
</script>

<nav class="tabbar" aria-label="Open quizzes">
  <div class="strip" role="tablist" bind:this={strip} {onwheel}>
    {#each tabs as t, i (t.id)}
      {@const active = t.id === library.activeId}
      {@const count = countOf(t)}
      <div
        class="tab"
        class:active
        class:dragging={dragId === t.id}
        class:drop={dropAt === i && dragId !== t.id}
        role="presentation"
        draggable={editing !== t.id}
        ondragstart={(e) => ondragstart(e, t)}
        ondragover={(e) => ondragover(e, i)}
        ondrop={(e) => ondrop(e, i)}
        ondragend={() => (dragId = dropAt = null)}
        onauxclick={(e) => onauxclick(e, t)}
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
            title="{nameOf(t)} · {count} question{count === 1 ? '' : 's'}{i < 9 ? ` (Alt+${i + 1})` : ''}{'\n'}Double-click to rename, drag to reorder"
            onclick={() => switchQuiz(t.id)}
            ondblclick={() => startRename(t)}
          >
            <span class="name">{nameOf(t)}</span>
            <span class="count">{count}</span>
          </button>
        {/if}
        {#if tabs.length > 1}
          <button class="close" title="Close tab (Alt+W). The quiz stays in your quiz list." aria-label="Close {nameOf(t)}" onclick={() => closeTab(t.id)}>
            <X size={13} />
          </button>
        {/if}
      </div>
    {/each}
    <button class="add" title="New quiz (Alt+Shift+N)" aria-label="New quiz" onclick={newQuiz}><Plus size={16} /></button>
  </div>
  <button class="all" title="All quizzes saved in this browser (Alt+O){hidden ? `\n${hidden} not shown as tabs` : ''}" onclick={() => openModal('quizzes')}>
    <LayoutList size={15} />
    <span class="all-text">All quizzes</span>
    <span class="total">{library.quizzes.length}</span>
  </button>
</nav>

<style>
  .tabbar {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 36px;
    padding: 0 8px 0 6px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
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
    height: 30px;
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
    /* Cover the bar's bottom border so the tab joins the page below. */
    margin-bottom: -1px;
    height: 31px;
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
  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 4px 0 12px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .tab.active .label {
    font-weight: 600;
  }
  .label:focus-visible,
  .close:focus-visible,
  .add:focus-visible,
  .all:focus-visible {
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
    margin: 0 0 1px 2px;
    border-radius: 6px;
    align-self: center;
  }
  .all {
    flex: none;
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .all:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .total {
    font-size: 11px;
    font-weight: 600;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface-3);
    font-variant-numeric: tabular-nums;
  }
  @media (hover: none) {
    .close {
      opacity: 1;
    }
  }
  @media (max-width: 560px) {
    .all-text {
      display: none;
    }
    .tab {
      min-width: 80px;
    }
  }
</style>
