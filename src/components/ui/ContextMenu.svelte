<script>
  import { onMount } from 'svelte';

  /**
   * A right-click menu at (x, y). `items` holds { label, icon, run, danger?, disabled? } and '-' for a separator.
   * It closes on a click elsewhere, Escape, Tab, scrolling or when the window loses focus.
   */
  let { x, y, items, onclose } = $props();
  let menu;
  let left = $state(x);
  let top = $state(y);

  const buttons = () => [...menu.querySelectorAll('button:not(:disabled)')];

  onMount(() => {
    // Keep the whole menu on screen.
    const r = menu.getBoundingClientRect();
    left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    top = Math.max(4, y + r.height > window.innerHeight - 4 ? y - r.height : y);
    buttons()[0]?.focus();
  });

  function choose(item) {
    onclose();
    item.run();
  }

  function onkeydown(e) {
    const all = buttons();
    const at = all.indexOf(document.activeElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? all[0] : all.at(-1))?.focus();
    }
  }

  const outside = (e) => !menu?.contains(e.target) && onclose();
</script>

<svelte:window onpointerdown={outside} onwheel={outside} onblur={onclose} onresize={onclose} />

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="menu" role="menu" tabindex="-1" bind:this={menu} style:left="{left}px" style:top="{top}px" {onkeydown} oncontextmenu={(e) => e.preventDefault()}>
  {#each items as item}
    {#if item === '-'}
      <hr />
    {:else}
      <button role="menuitem" class:danger={item.danger} disabled={item.disabled} onclick={() => choose(item)}>
        {#if item.icon}<item.icon size={14} />{/if}
        {item.label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 200;
    min-width: 190px;
    max-width: 320px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.15));
  }
  .menu:focus {
    outline: none;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--hover);
    outline: none;
  }
  button:disabled {
    color: var(--text-3);
    cursor: default;
  }
  .danger:not(:disabled) {
    color: var(--danger);
  }
  hr {
    margin: 4px 0;
    border: none;
    border-top: 1px solid var(--border);
  }
</style>
