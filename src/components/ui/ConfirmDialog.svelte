<script>
  import Modal from './Modal.svelte';
  let { confirm } = $props();
</script>

<Modal title={confirm.title} width={confirm.primary ? '520px' : '440px'} onclose={() => confirm.resolve(false)}>
  <p class="msg">{confirm.message}</p>
  {#snippet footer()}
    <button class="btn" onclick={() => confirm.resolve(false)}>Cancel</button>
    {#if confirm.primary}
      <button class="btn {confirm.danger ? 'btn-danger' : ''}" onclick={() => confirm.resolve(true)}>{confirm.confirmLabel}</button>
      <button class="btn btn-primary" data-autofocus onclick={() => confirm.resolve('primary')}>{confirm.primary}</button>
    {:else}
      <button class="btn {confirm.danger ? 'btn-danger' : 'btn-primary'}" data-autofocus onclick={() => confirm.resolve(true)}>{confirm.confirmLabel}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .msg {
    color: var(--text-2);
  }
</style>
