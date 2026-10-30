<script>
  import { Plus, Trash } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { uid } from '../../lib/model.js';

  // Units of numerical and calculated questions.
  let { q = $bindable() } = $props();
</script>

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

<style>
  .unit {
    display: grid;
    grid-template-columns: 1fr 140px 30px;
    gap: 8px;
  }
</style>
