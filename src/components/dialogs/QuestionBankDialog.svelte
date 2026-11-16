<script>
  import { onMount } from 'svelte';
  import { Search, Plus } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import { app, library, closeModal, loadAllQuizzes, addFromBank } from '../../lib/store.svelte.js';
  import { questionTitle, TYPE_MAP, QUESTION_TYPES } from '../../lib/model.js';
  import { questionContent } from '../../lib/quality.js';
  import { foldText } from '../../lib/cloud.js';
  import { TYPE_ICONS } from '../../lib/icons.js';

  // Rows drawn at once; a search narrows down longer lists.
  const SHOW = 300;

  // Every question in the other quizzes: { key, quizId, quizName, q, title, text, folded }.
  let entries = $state(null);
  let query = $state('');
  let quiz = $state('');
  let type = $state('');
  let picked = $state([]);

  // Questions the open quiz already has, by their text, to point out copies.
  const here = new Set(app.quiz.questions.map((q) => foldText(questionContent(q))));

  onMount(async () => {
    const all = await loadAllQuizzes();
    entries = all
      .filter((x) => x.id !== library.activeId)
      .flatMap(({ id, name, quiz }) =>
        quiz.questions.map((q) => {
          const title = questionTitle(q).replace(/\s+/g, ' ');
          const text = questionContent(q).replace(/\s+/g, ' ').trim();
          return { key: `${id}/${q.id}`, quizId: id, quizName: name, q, title, text, folded: foldText(`${title} ${text} ${(q.tags ?? []).join(' ')}`), copy: here.has(foldText(questionContent(q))) };
        })
      );
  });

  const quizzes = $derived(entries ? [...new Map(entries.map((e) => [e.quizId, e.quizName]))] : []);
  const types = $derived(entries ? QUESTION_TYPES.filter((t) => entries.some((e) => e.q.type === t.type)) : []);
  const terms = $derived(foldText(query).split(' ').filter(Boolean));
  const matches = $derived(entries?.filter((e) => (!quiz || e.quizId === quiz) && (!type || e.q.type === type) && terms.every((t) => e.folded.includes(t))) ?? []);
  const shown = $derived(matches.slice(0, SHOW));
  const pickedSet = $derived(new Set(picked));
  const allShownPicked = $derived(shown.length > 0 && shown.every((e) => pickedSet.has(e.key)));

  function toggle(key) {
    picked = pickedSet.has(key) ? picked.filter((k) => k !== key) : [...picked, key];
  }

  function toggleAll() {
    const keys = shown.map((e) => e.key);
    picked = allShownPicked ? picked.filter((k) => !keys.includes(k)) : [...new Set([...picked, ...keys])];
  }

  function add() {
    // In the order they appear in the bank, not the order they were ticked.
    addFromBank(entries.filter((e) => pickedSet.has(e.key)).map((e) => e.q));
    closeModal();
  }

  const excerpt = (e) => (e.text && e.text !== e.title ? e.text.slice(0, 240) : '');
</script>

<Modal title="Question bank" subtitle="Copy questions from your other quizzes in this browser into this one." width="760px" onclose={closeModal}>
  {#if !entries}
    <p class="note">Loading your quizzes…</p>
  {:else if !entries.length}
    <p class="note">Your other quizzes have no questions yet. Questions from every other quiz tab show up here, ready to copy into this quiz.</p>
  {:else}
    <div class="filters">
      <div class="search">
        <Search size={15} />
        <input class="input" type="search" placeholder="Search questions, answers and tags…" aria-label="Search the question bank" data-autofocus bind:value={query} />
      </div>
      <select class="input" aria-label="Quiz" bind:value={quiz}>
        <option value="">All quizzes</option>
        {#each quizzes as [id, name] (id)}<option value={id}>{name}</option>{/each}
      </select>
      <select class="input" aria-label="Question type" bind:value={type}>
        <option value="">All types</option>
        {#each types as t (t.type)}<option value={t.type}>{t.label}</option>{/each}
      </select>
    </div>

    <div class="head">
      <label class="all">
        <input type="checkbox" checked={allShownPicked} indeterminate={!allShownPicked && shown.some((e) => pickedSet.has(e.key))} disabled={!shown.length} onchange={toggleAll} />
        {matches.length === entries.length ? `${entries.length} question${entries.length === 1 ? '' : 's'}` : `${matches.length} of ${entries.length} questions`}
      </label>
      {#if matches.length > SHOW}<span class="more">Showing the first {SHOW}; search to narrow down.</span>{/if}
    </div>

    <ul class="list" aria-label="Questions">
      {#each shown as e (e.key)}
        {@const Icon = TYPE_ICONS[e.q.type]}
        <li>
          <label class="row" class:on={pickedSet.has(e.key)}>
            <input type="checkbox" checked={pickedSet.has(e.key)} onchange={() => toggle(e.key)} />
            <span class="icon" title={TYPE_MAP[e.q.type].label}><Icon size={15} /></span>
            <span class="body">
              {#if e.q.name?.trim()}
                <span class="title">{e.title}</span>
                {#if excerpt(e)}<span class="text">{excerpt(e)}</span>{/if}
              {:else}
                <!-- Without a name, the title would only repeat the start of the text. -->
                <span class="text lead">{e.text.slice(0, 240) || e.title}</span>
              {/if}
              <span class="meta">{e.quizName} · {TYPE_MAP[e.q.type].label}{#if e.copy}<span class="copy"> · already in this quiz</span>{/if}</span>
            </span>
          </label>
        </li>
      {:else}
        <li class="note empty">No questions match.</li>
      {/each}
    </ul>
  {/if}

  {#snippet footer()}
    {#if picked.length}<span class="count">{picked.length} selected</span>{/if}
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button class="btn btn-primary" disabled={!picked.length} onclick={add}><Plus size={16} /> Add {picked.length > 1 ? `${picked.length} questions` : 'to this quiz'}</button>
  {/snippet}
</Modal>

<style>
  .note {
    margin: 0;
    color: var(--text-2);
  }
  .filters {
    display: flex;
    gap: 8px;
  }
  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-3);
  }
  .search .input {
    flex: 1;
    min-width: 0;
  }
  .filters select {
    flex: 0 1 180px;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: -8px;
    font-size: 13px;
    color: var(--text-2);
  }
  .all {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 13px;
    cursor: pointer;
  }
  .more {
    color: var(--text-3);
    font-size: 12px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 120px;
    max-height: 52vh;
    overflow: auto;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.on {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--accent-soft);
  }
  input[type='checkbox'] {
    margin: 2px 0 0;
    accent-color: var(--accent);
  }
  .icon {
    flex: none;
    display: inline-flex;
    margin-top: 1px;
    color: var(--accent);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .text {
    font-size: 12.5px;
    color: var(--text-2);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
  .text.lead {
    font-size: inherit;
    font-weight: 500;
    color: var(--text);
  }
  .meta {
    font-size: 12px;
    color: var(--text-3);
  }
  .copy {
    color: var(--warning);
  }
  .empty {
    padding: 14px 4px;
  }
  .count {
    margin-right: auto;
    font-size: 13px;
    color: var(--text-2);
  }
  @media (max-width: 640px) {
    .filters {
      flex-wrap: wrap;
    }
    .search {
      flex: 1 0 100%;
    }
    .filters select {
      flex: 1 1 0;
    }
  }
</style>
