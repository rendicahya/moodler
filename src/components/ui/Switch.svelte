<script>
  import Info from './Info.svelte';

  let { checked = $bindable(false), label = '', description = '', info = '', disabled = false, onchange } = $props();
</script>

{#snippet control()}
  <label class="switch" class:disabled>
    <input type="checkbox" bind:checked {disabled} onchange={() => onchange?.(checked)} />
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    {#if label || description}
      <span class="text">
        {#if label}<span class="label-text">{label}</span>{/if}
        {#if description}<span class="desc">{description}</span>{/if}
      </span>
    {/if}
  </label>
{/snippet}

{#if info}
  <span class="with-info">{@render control()}<Info text={info} label="About {label}" /></span>
{:else}
  {@render control()}
{/if}

<style>
  .with-info {
    display: inline-flex;
    align-items: flex-start;
    gap: 4px;
  }
  .with-info > :global(.info) {
    margin-top: 1px;
  }
  .switch {
    display: inline-flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .switch.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .track {
    flex: none;
    position: relative;
    width: 34px;
    height: 20px;
    margin-top: 1px;
    border-radius: 999px;
    background: var(--border-strong);
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s;
  }
  input:checked + .track {
    background: var(--accent);
  }
  input:checked + .track .thumb {
    transform: translateX(14px);
  }
  input:focus-visible + .track {
    box-shadow: var(--focus);
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .label-text {
    font-size: 13.5px;
    font-weight: 500;
  }
  .desc {
    font-size: 12px;
    color: var(--text-3);
  }
</style>
