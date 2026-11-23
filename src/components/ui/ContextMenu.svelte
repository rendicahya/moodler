<script>
  import { onMount, tick } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';

  /**
   * A right-click menu at (x, y). `items` holds { label, icon, run, danger?, disabled?, hint? (a shortcut) } and '-' for a separator. An item
   * with `items` instead of `run` opens a submenu of those items beside it (one level deep).
   * It closes on a click elsewhere, Escape, Tab, scrolling or when the window loses focus.
   */
  let { x, y, items, onclose } = $props();
  let menu;
  let subEl = $state();
  let left = $state(x);
  let top = $state(y);
  // The open submenu: { item, anchor (its button), left, top }.
  let sub = $state(null);

  const buttons = () => [...menu.querySelectorAll(':scope > button:not(:disabled)')];
  const subButtons = () => (subEl ? [...subEl.querySelectorAll('button:not(:disabled)')] : []);

  onMount(() => {
    // Keep the whole menu on screen.
    const r = menu.getBoundingClientRect();
    left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    top = Math.max(4, y + r.height > window.innerHeight - 4 ? y - r.height : y);
    // With every item disabled the menu itself takes the focus, so that Escape closes the menu and not what is under it.
    (buttons()[0] ?? menu).focus();
  });

  async function openSub(item, anchor, focus = false) {
    if (sub?.item !== item) {
      const a = anchor.getBoundingClientRect();
      sub = { item, anchor, left: a.right + 2, top: a.top - 5 };
      await tick();
      // Open to the left when there is no room on the right, and keep it on screen.
      const r = subEl.getBoundingClientRect();
      sub.left = a.right + 2 + r.width > window.innerWidth - 4 ? Math.max(4, a.left - r.width - 2) : a.right + 2;
      sub.top = Math.max(4, Math.min(a.top - 5, window.innerHeight - r.height - 4));
    }
    if (focus) subButtons()[0]?.focus();
  }

  function closeSub(refocus = false) {
    const anchor = sub?.anchor;
    sub = null;
    if (refocus) anchor?.focus();
  }

  function choose(item, e) {
    if (item.items) return openSub(item, e.currentTarget, e.detail === 0);
    onclose();
    item.run();
  }

  function onkeydown(e) {
    const inSub = subEl?.contains(document.activeElement);
    const all = inSub ? subButtons() : buttons();
    const at = all.indexOf(document.activeElement);
    const current = !inSub && items.filter((i) => i !== '-' && !i.disabled)[at];
    if (e.key === 'Escape' && inSub) {
      e.preventDefault();
      e.stopPropagation();
      closeSub(true);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowRight' && current?.items) {
      e.preventDefault();
      openSub(current, document.activeElement, true);
    } else if (e.key === 'ArrowLeft' && inSub) {
      e.preventDefault();
      closeSub(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!inSub) closeSub();
      all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (!inSub) closeSub();
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
      <button
        role="menuitem"
        class:danger={item.danger}
        class:active={sub?.item === item}
        disabled={item.disabled}
        aria-haspopup={item.items ? 'menu' : undefined}
        aria-expanded={item.items ? sub?.item === item : undefined}
        onclick={(e) => choose(item, e)}
        onpointerenter={(e) => (item.items ? !item.disabled && openSub(item, e.currentTarget) : closeSub())}
      >
        {#if item.icon}<item.icon size={14} />{/if}
        <span class="label">{item.label}</span>
        {#if item.hint}<kbd>{item.hint}</kbd>{/if}
        {#if item.items}<ChevronRight size={14} class="chevron" />{/if}
      </button>
    {/if}
  {/each}
  {#if sub}
    <div class="menu sub" role="menu" bind:this={subEl} style:left="{sub.left}px" style:top="{sub.top}px">
      {#each sub.item.items as item}
        {#if item === '-'}
          <hr />
        {:else}
          <button role="menuitem" class:danger={item.danger} disabled={item.disabled} onclick={(e) => choose(item, e)}>
            {#if item.icon}<item.icon size={14} />{/if}
            <span class="label">{item.label}</span>
            {#if item.hint}<kbd>{item.hint}</kbd>{/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
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
  .sub {
    z-index: 201;
    min-width: 160px;
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
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  kbd {
    margin-left: 16px;
    font: inherit;
    font-size: 11.5px;
    color: var(--text-3);
  }
  button :global(.chevron) {
    margin-right: -4px;
    color: var(--text-3);
  }
  button:hover:not(:disabled),
  button:focus-visible,
  button.active {
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
