<script>
  import { FRACTIONS, fractionLabel } from '../../lib/model.js';

  let { value = $bindable(0), negative = false, label = 'Grade' } = $props();

  const options = $derived.by(() => {
    const list = negative ? [...FRACTIONS, ...FRACTIONS.filter((f) => f > 0).map((f) => -f).reverse()] : [...FRACTIONS];
    if (!list.some((f) => Math.abs(f - Number(value)) < 0.001)) list.push(Number(value));
    return list;
  });

  const match = $derived(options.find((f) => Math.abs(f - Number(value)) < 0.001));
</script>

<select class="select select-sm" aria-label={label} value={match} onchange={(e) => (value = Number(e.currentTarget.value))}>
  {#each options as f}
    <option value={f}>{fractionLabel(f)}</option>
  {/each}
</select>

<style>
  select {
    width: 110px;
    font-variant-numeric: tabular-nums;
  }
</style>
