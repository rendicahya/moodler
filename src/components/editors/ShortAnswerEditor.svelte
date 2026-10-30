<script>
  import { Plus, GripVertical, Trash } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import FractionSelect from '../ui/FractionSelect.svelte';
  import Info from '../ui/Info.svelte';
  import RichText from '../RichText.svelte';
  import UnitsSection from './UnitsSection.svelte';
  import { newAnswer, moveItem } from '../../lib/model.js';
  import { createSortable } from '../../lib/sortable.svelte.js';

  let { q = $bindable(), numerical = false } = $props();
  const sort = createSortable((from, to) => moveItem(q.answers, from, to));
</script>

<Section
  title="Accepted answers"
  required
  info={numerical
    ? 'At least one answer is needed, and one must be worth 100%. A response is compared with each answer in turn and gets the grade of the first one it matches.'
    : 'At least one answer is needed, and one must be worth 100%. Add common misspellings or partly right answers with a lower grade.'}
  subtitle={numerical
    ? 'Responses within ± tolerance of an answer receive its grade. Use * to match any other number.'
    : 'Use * as a wildcard (e.g. "colo*r"). Answers are checked in order; the first match wins.'}
>
  {#snippet actions()}
    {#if !numerical}<Switch bind:checked={q.usecase} label="Case sensitive" info="When on, “Paris” and “paris” count as different responses." />{/if}
  {/snippet}
  <div class="table" role="table">
    <div class="thead" class:numerical role="row">
      <span></span>
      <span role="columnheader">Answer</span>
      {#if numerical}<span role="columnheader"
          >Error (±) <Info text="The tolerance: how far a response may be from the answer and still be accepted. E.g. answer 3.14 with error 0.01 accepts 3.13 to 3.15." label="About error" /></span
        >{/if}
      <span role="columnheader">Grade <Info text="The percentage of the question’s mark awarded for this answer. “None” means 0%." label="About grade" /></span>
      <span role="columnheader">Feedback <span class="opt">optional</span></span>
      <span></span>
    </div>
    {#each q.answers as a, i (a.id)}
      {@const ind = sort.indicator(i)}
      <div class="tr" class:numerical class:drop-before={ind === 'before'} class:drop-after={ind === 'after'} role="row" {...sort.item(i)}>
        <span class="drag-handle" title="Drag to reorder" {...sort.handle(i)}><GripVertical size={15} /></span>
        <input class="input input-sm" class:mono={numerical} bind:value={a.text} placeholder={numerical ? 'e.g. 3.14' : 'Accepted answer'} aria-label="Answer {i + 1}" />
        {#if numerical}
          <input class="input input-sm mono" type="number" step="any" min="0" bind:value={a.tolerance} aria-label="Tolerance for answer {i + 1}" />
        {/if}
        <FractionSelect bind:value={a.fraction} />
        <RichText bind:value={a.feedback} compact minHeight={30} placeholder="Feedback (optional)" label="Feedback for answer {i + 1}" />
        <button class="btn btn-ghost btn-icon btn-sm danger" title="Remove" aria-label="Remove answer" onclick={() => q.answers.splice(i, 1)}><Trash size={15} /></button>
      </div>
    {/each}
  </div>
  <div>
    <button class="btn btn-sm" onclick={() => q.answers.push(newAnswer(numerical ? { tolerance: 0 } : {}))}><Plus size={15} /> Add answer</button>
  </div>
</Section>

{#if numerical}
  <UnitsSection bind:q />
{/if}

<style>
  .table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .thead,
  .tr {
    display: grid;
    grid-template-columns: 22px minmax(140px, 1.2fr) 110px minmax(140px, 1.5fr) 30px;
    gap: 8px;
    align-items: start;
  }
  .tr.numerical,
  .thead.numerical {
    grid-template-columns: 22px minmax(110px, 1fr) 100px 110px minmax(140px, 1.5fr) 30px;
  }
  .thead {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .thead > span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .thead .opt {
    text-transform: none;
    letter-spacing: normal;
  }
  .tr {
    padding: 4px 0;
    border-radius: 4px;
  }
  .tr > .drag-handle {
    margin-top: 6px;
  }
  @media (max-width: 760px) {
    .thead {
      display: none;
    }
    .tr,
    .tr.numerical {
      grid-template-columns: 22px 1fr 1fr;
    }
  }
</style>
