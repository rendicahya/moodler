<script>
  let { value = $bindable(), options, label = '', size = 'md' } = $props();
</script>

<div class="seg {size}" role="radiogroup" aria-label={label}>
  {#each options as o}
    <button type="button" role="radio" aria-checked={value === o.value} class:on={value === o.value} title={o.title} onclick={() => (value = o.value)}>
      {#if o.icon}<o.icon size={15} />{/if}
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--radius);
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-2);
    font-weight: 500;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .sm button {
    height: 24px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  button:hover {
    color: var(--text);
  }
  button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
