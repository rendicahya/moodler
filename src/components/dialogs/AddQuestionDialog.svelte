<script>
  import Modal from '../ui/Modal.svelte';
  import { QUESTION_TYPES } from '../../lib/model.js';
  import { TYPE_ICONS } from '../../lib/icons.js';
  import { addQuestion, closeModal } from '../../lib/store.svelte.js';

  const GIFT_OK = new Set(['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay', 'matching', 'description']);

  function pick(type) {
    addQuestion(type);
    closeModal();
  }
</script>

<Modal title="Add a question" subtitle="Choose a question type. The new question is inserted after the selected one." width="760px" onclose={closeModal}>
  <div class="types">
    {#each QUESTION_TYPES as t, i}
      {@const Icon = TYPE_ICONS[t.type]}
      <button class="type" onclick={() => pick(t.type)} data-autofocus={i === 0 ? "" : undefined}>
        <span class="icon"><Icon size={20} /></span>
        <span class="text">
          <span class="name">{t.label}</span>
          <span class="desc">{t.description}</span>
          <span class="formats">
            <span class="badge">XML</span>
            {#if GIFT_OK.has(t.type)}<span class="badge">GIFT</span>{/if}
            {#if t.type === 'multichoice'}<span class="badge">Aiken</span>{/if}
          </span>
        </span>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 600px) {
    .types {
      grid-template-columns: 1fr;
    }
  }
  .type {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, transform 0.12s;
  }
  .type:hover,
  .type:focus-visible {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .icon {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-3);
    color: var(--accent);
  }
  .type:hover .icon {
    background: var(--accent);
    color: var(--on-accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .desc {
    font-size: 12.5px;
    color: var(--text-2);
  }
  .formats {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .formats .badge {
    height: 17px;
    font-size: 10px;
  }
</style>
