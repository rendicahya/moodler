<script>
  import { ChevronDown } from '@lucide/svelte';
  import Info from './Info.svelte';

  let { title, subtitle = '', collapsible = false, open: initiallyOpen = true, required = false, optional = false, info = '', actions, children } = $props();
  // Only the initial value is used, so the section doesn't collapse while the user edits its content.
  // svelte-ignore state_referenced_locally
  let open = $state(initiallyOpen);
</script>

{#snippet heading()}
  <h3>
    {title}
    {#if required}<span class="req" title="Required">*</span>{/if}
    {#if optional}<span class="opt">optional</span>{/if}
  </h3>
{/snippet}

<section class="card">
  <div class="card-header" class:closed={!open}>
    <div class="head">
      {#if collapsible}
        <button class="toggle" aria-expanded={open} onclick={() => (open = !open)}>
          <span class="chev" class:rot={!open}><ChevronDown size={16} /></span>
          <span>
            {@render heading()}
            {#if subtitle}<p class="sub">{subtitle}</p>{/if}
          </span>
        </button>
      {:else}
        <div>
          {@render heading()}
          {#if subtitle}<p class="sub">{subtitle}</p>{/if}
        </div>
      {/if}
      {#if info}<span class="info-slot"><Info text={info} label="About {title}" /></span>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if open}
    <div class="card-body">{@render children()}</div>
  {/if}
</section>

<style>
  .closed {
    border-bottom: none;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .info-slot {
    display: inline-flex;
    margin-top: 0;
  }
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .chev {
    display: inline-flex;
    margin-top: 1px;
    color: var(--text-3);
    transition: transform 0.15s;
  }
  .chev.rot {
    transform: rotate(-90deg);
  }
  .actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
</style>
