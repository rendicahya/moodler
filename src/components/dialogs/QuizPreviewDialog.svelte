<script>
  import { SquarePen } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Preview from '../Preview.svelte';
  import { parseCloze } from '../../lib/formats/cloze.js';
  import { round } from '../../lib/model.js';
  import { app, closeModal, select } from '../../lib/store.svelte.js';

  let showAnswers = $state(false);

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
    <Switch bind:checked={showAnswers} label="Show correct answers" />
  </div>

  <ol class="questions">
    {#each items as { q, number } (q.id)}
      <li class="item">
        <Preview {q} index={number - 1} {showAnswers} />
        <button class="btn btn-ghost btn-sm edit" title="Edit this question" onclick={() => edit(q.id)}><SquarePen size={14} /> Edit</button>
      </li>
    {/each}
  </ol>

  {#snippet footer()}
    <button class="btn btn-primary" onclick={closeModal}>Close</button>
  {/snippet}
</Modal>

<style>
  .bar {
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
  .item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .item + .item {
    padding-top: 22px;
    border-top: 1px solid var(--border);
  }
  .edit {
    align-self: flex-end;
    color: var(--text-3);
  }
  .edit:hover {
    color: var(--accent);
  }
</style>
