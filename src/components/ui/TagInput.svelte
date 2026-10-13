<script>
  import { X } from '@lucide/svelte';

  let { tags = $bindable([]), placeholder = 'Add a tag and press Enter', id } = $props();
  let text = $state('');

  function add() {
    const parts = text
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t));
    if (parts.length) tags.push(...parts);
    text = '';
  }

  function onkeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !text && tags.length) {
      tags.pop();
    }
  }
</script>

<div class="tags">
  {#each tags as t, i}
    <span class="tag">
      {t}
      <button type="button" aria-label="Remove tag {t}" onclick={() => tags.splice(i, 1)}><X size={12} /></button>
    </span>
  {/each}
  <input {id} bind:value={text} {onkeydown} onblur={add} placeholder={tags.length ? '' : placeholder} />
</div>

<style>
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 34px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
  .tags:focus-within {
    border-color: var(--accent);
    box-shadow: var(--focus);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 4px 0 9px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 12.5px;
    font-weight: 500;
  }
  .tag button {
    display: inline-flex;
    border: none;
    background: none;
    color: inherit;
    padding: 2px;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0.7;
  }
  .tag button:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  input {
    flex: 1;
    min-width: 120px;
    border: none;
    outline: none;
    background: none;
    height: 24px;
    padding: 0 4px;
  }
</style>
