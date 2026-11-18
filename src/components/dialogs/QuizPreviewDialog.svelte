<script>
  import { SquarePen, Printer } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Preview from '../Preview.svelte';
  import { parseCloze } from '../../lib/formats/cloze.js';
  import { round } from '../../lib/model.js';
  import { app, closeModal, openModal, select } from '../../lib/store.svelte.js';

  // Moodle numbers questions but not descriptions, so number them the same way.
  const items = $derived.by(() => {
    let n = 0;
    return app.quiz.questions.map((q) => ({ q, number: q.type === 'description' ? 0 : ++n }));
  });
  const markOf = (q) => (q.type === 'cloze' ? parseCloze(q.questiontext).reduce((s, g) => s + g.weight, 0) : Number(q.defaultgrade) || 0);
  const total = $derived(round(app.quiz.questions.reduce((s, q) => s + (q.type === 'description' ? 0 : markOf(q)), 0), 2));
  const count = $derived(items.filter((i) => i.number).length);

  function edit(id) {
    select(id);
    app.tab = 'edit';
    closeModal();
  }
</script>

<Modal title={app.quiz.name || 'Untitled quiz'} subtitle="Whole-quiz preview · {count} question{count === 1 ? '' : 's'} · {total} mark{total === 1 ? '' : 's'}" width="980px" onclose={closeModal}>
  <div class="bar">
    <span class="hint">How students see the questions, in order. Options are shown unshuffled.</span>
    <span title="Alt+A"><Switch bind:checked={app.revealAnswers} label="Show correct answers" /></span>
  </div>

  <ol class="questions">
    {#each items as { q, number } (q.id)}
      <li class="item">
        <div class="body"><Preview {q} index={number - 1} showAnswers={app.revealAnswers} /></div>
        <button class="btn btn-sm edit" title="Edit this question" onclick={() => edit(q.id)}><SquarePen size={14} /> Edit</button>
      </li>
    {/each}
  </ol>

  {#snippet footer()}
    <button class="btn" onclick={() => openModal('print')}><Printer size={16} /> Print…</button>
    <button class="btn btn-primary" onclick={closeModal}>Close</button>
  {/snippet}
</Modal>

<style>
  /* Stays pinned to the top of the scrolling dialog body so the switch is always in reach. */
  .bar {
    position: sticky;
    top: -18px;
    z-index: 3;
    margin: -18px -20px 0;
    padding: 12px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .questions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  /* The Edit button keeps the same spot beside every question, at its top right, and stays in view below the bar while a long question scrolls past. */
  .item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .item + .item {
    padding-top: 22px;
    border-top: 1px solid var(--border);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .edit {
    flex: none;
    position: sticky;
    top: 46px;
    gap: 5px;
  }
  .edit:hover {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  @media (max-width: 560px) {
    .item {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 6px;
    }
    .edit {
      position: static;
      align-self: flex-end;
    }
  }
</style>
