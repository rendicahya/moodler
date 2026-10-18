<script>
  import { FilePlus, Copy, FolderInput } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import { app, library, byRecent, closeModal, copyQuestionsTo } from '../../lib/store.svelte.js';

  const ids = [...app.checked];
  const others = [...library.quizzes].filter((q) => q.id !== library.activeId).sort(byRecent);
  // '' stands for a new quiz.
  let target = $state(others[0]?.id ?? '');

  function run(move) {
    copyQuestionsTo(target || null, ids, move);
    closeModal();
  }
</script>

<Modal
  title="Copy or move to another quiz"
  subtitle="{ids.length} selected question{ids.length === 1 ? '' : 's'}. Copies get their own IDs; moving removes them from this quiz (undo with Ctrl+Z)."
  width="520px"
  onclose={closeModal}
>
  <div class="list" role="radiogroup" aria-label="Target quiz">
    {#each others as q (q.id)}
      <label class="option" class:on={target === q.id}>
        <input type="radio" name="target" value={q.id} bind:group={target} />
        <span class="name">{q.name}</span>
        <span class="meta">{q.count} question{q.count === 1 ? '' : 's'}</span>
      </label>
    {/each}
    <label class="option" class:on={target === ''}>
      <input type="radio" name="target" value="" bind:group={target} />
      <span class="name new"><FilePlus size={15} /> A new quiz</span>
    </label>
  </div>

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button class="btn" onclick={() => run(true)}><FolderInput size={16} /> Move</button>
    <button class="btn btn-primary" onclick={() => run(false)}><Copy size={16} /> Copy</button>
  {/snippet}
</Modal>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 50vh;
    overflow: auto;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .option:hover {
    background: var(--hover);
  }
  .option.on {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--accent-soft);
  }
  .option input {
    margin: 0;
    accent-color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .meta {
    flex: none;
    font-size: 12px;
    color: var(--text-3);
  }
</style>
