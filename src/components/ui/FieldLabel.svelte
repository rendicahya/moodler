<script>
  import Info from './Info.svelte';

  /** A form label with an optional required/optional marker and an explanation tooltip. */
  let { for: forId, text, required = false, optional = false, info = '', children } = $props();
</script>

<div class="field-label">
  {#if forId}<label for={forId}>{text}</label>{:else}<span>{text}</span>{/if}
  {#if required}<span class="req" title="Required">*</span>{/if}
  {#if optional}<span class="opt">optional</span>{/if}
  {#if info}<Info text={info} label="About {text}" />{/if}
  {@render children?.()}
</div>
