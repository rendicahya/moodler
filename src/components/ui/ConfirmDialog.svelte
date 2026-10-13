<script>
  import Modal from './Modal.svelte';
  let { confirm } = $props();
</script>

<Modal title={confirm.title} width="440px" onclose={() => confirm.resolve(false)}>
  <p class="msg">{confirm.message}</p>
  {#snippet footer()}
    <button class="btn" onclick={() => confirm.resolve(false)}>Cancel</button>
    <button class="btn {confirm.danger ? 'btn-danger' : 'btn-primary'}" data-autofocus onclick={() => confirm.resolve(true)}>{confirm.confirmLabel}</button>
  {/snippet}
</Modal>

<style>
  .msg {
    color: var(--text-2);
  }
</style>
