<script>
  import { Plus, GripVertical, Trash } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import FractionSelect from '../ui/FractionSelect.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import Info from '../ui/Info.svelte';
  import RichText from '../RichText.svelte';
  import { newAnswer, moveItem, uid } from '../../lib/model.js';
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
  <Section
    title="Units"
    subtitle="The first unit (multiplier 1) is the base unit."
    optional
    info="Lets students answer in different units. Each unit has a multiplier relative to the base unit, e.g. base m = 1, cm = 100, km = 0.001."
    collapsible open={q.units.length > 0}>
    {#each q.units as u, i (u.id)}
      <div class="unit">
        <input class="input input-sm" bind:value={u.unit} placeholder="Unit, e.g. cm" aria-label="Unit {i + 1}" />
        <input class="input input-sm mono" type="number" step="any" bind:value={u.multiplier} aria-label="Multiplier for unit {i + 1}" title="Multiplier relative to the base unit" />
        <button class="btn btn-ghost btn-icon btn-sm danger" aria-label="Remove unit" onclick={() => q.units.splice(i, 1)}><Trash size={15} /></button>
      </div>
    {/each}
    <div>
      <button class="btn btn-sm" onclick={() => q.units.push({ id: uid(), unit: '', multiplier: 1 })}><Plus size={15} /> Add unit</button>
    </div>
    {#if q.units.length}
      <div class="grid-3">
        <div class="field">
          <FieldLabel
            for="showunits-{q.id}"
            text="Unit handling"
            info="Whether units are used, and how students give them: typed after the number, chosen from options, or picked from a drop-down."
          />
          <select id="showunits-{q.id}" class="select select-sm" bind:value={q.showunits}>
            <option value={3}>Units are not used / not shown</option>
            <option value={0}>Text input element</option>
            <option value={1}>Multiple choice selection</option>
            <option value={2}>Drop-down menu</option>
          </select>
        </div>
        <div class="field">
          <FieldLabel
            for="unitgrading-{q.id}"
            text="Unit penalty applies to"
            info="What happens when the number is right but the unit is wrong or missing: nothing (units optional), or the unit penalty is taken off the response’s grade or off the question’s full mark."
          />
          <select id="unitgrading-{q.id}" class="select select-sm" bind:value={q.unitgradingtype}>
            <option value={0}>Units are optional</option>
            <option value={1}>Fraction of response grade</option>
            <option value={2}>Fraction of question grade</option>
          </select>
        </div>
        <div class="field">
          <FieldLabel for="unitpenalty-{q.id}" text="Unit penalty" info="A fraction between 0 and 1. E.g. 0.1 takes off 10% when the unit is wrong." />
          <input id="unitpenalty-{q.id}" class="input input-sm" type="number" min="0" max="1" step="0.05" bind:value={q.unitpenalty} />
        </div>
      </div>
      <Switch bind:checked={q.unitsleft} label="Units go on the left" description="e.g. $1.00 instead of 1.00 $" />
    {/if}
  </Section>
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
  .unit {
    display: grid;
    grid-template-columns: 1fr 140px 30px;
    gap: 8px;
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
