<script>
  import { Plus, GripVertical, Trash, ArrowRight } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import RichText from '../RichText.svelte';
  import { moveItem, uid } from '../../lib/model.js';
  import { createSortable } from '../../lib/sortable.svelte.js';

  let { q = $bindable() } = $props();
  const sort = createSortable((from, to) => moveItem(q.subquestions, from, to));
</script>

<Section
  title="Pairs"
  subtitle="Each question is matched with its answer. Leave a question empty to add an extra distractor answer."
  required
  info="At least two questions with answers are needed. Students pick the matching answer for each question from a drop-down that lists all the answers."
>
  {#snippet actions()}
    <Switch bind:checked={q.shuffleanswers} label="Shuffle" info="Shows the questions in a random order for each attempt." />
  {/snippet}
  <div class="pairs">
    {#each q.subquestions as s, i (s.id)}
      {@const ind = sort.indicator(i)}
      <div class="pair" class:drop-before={ind === 'before'} class:drop-after={ind === 'after'} {...sort.item(i)}>
        <span class="drag-handle" title="Drag to reorder" {...sort.handle(i)}><GripVertical size={15} /></span>
        <span class="n">{i + 1}</span>
        <RichText bind:value={s.text} compact placeholder="Question {i + 1}" label="Question {i + 1}" />
        <span class="arrow"><ArrowRight size={16} /></span>
        <input class="input" bind:value={s.answer} placeholder="Matching answer" aria-label="Answer {i + 1}" />
        <button class="btn btn-ghost btn-icon btn-sm danger" title="Remove" aria-label="Remove pair" onclick={() => q.subquestions.splice(i, 1)}><Trash size={15} /></button>
      </div>
    {/each}
  </div>
  <div>
    <button class="btn btn-sm" onclick={() => q.subquestions.push({ id: uid(), text: '', answer: '' })}><Plus size={15} /> Add pair</button>
  </div>
</Section>

<style>
  .pairs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pair {
    display: grid;
    grid-template-columns: 22px 20px minmax(0, 1.4fr) 20px minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: start;
    padding: 2px 0;
  }
  .pair > .drag-handle,
  .n,
  .arrow {
    margin-top: 8px;
  }
  .n {
    font-size: 12px;
    color: var(--text-3);
    font-weight: 600;
    text-align: right;
  }
  .arrow {
    color: var(--text-3);
    display: inline-flex;
  }
  @media (max-width: 700px) {
    .pair {
      grid-template-columns: 22px 1fr 30px;
    }
    .n,
    .arrow {
      display: none;
    }
  }
</style>
