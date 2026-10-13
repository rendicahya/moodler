<script>
  import { X } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let { title, subtitle = '', width = '560px', onclose, children, footer } = $props();
  let dialog;

  onMount(() => {
    const prev = document.activeElement;
    const first = dialog.querySelector('[data-autofocus]') || dialog.querySelector('input, textarea, select, button:not(.modal-close):not(.info)');
    first?.focus();
    return () => prev?.focus?.();
  });

  function onkeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    } else if (e.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')].filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && onclose?.()} {onkeydown}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={title} style:max-width={width} bind:this={dialog}>
    <header>
      <div>
        <h2>{title}</h2>
        {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
      </div>
      <button class="btn btn-ghost btn-icon btn-sm modal-close" onclick={onclose} aria-label="Close"><X size={18} /></button>
    </header>
    <div class="content">
      {@render children()}
    </div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(10, 14, 22, 0.5);
    backdrop-filter: blur(2px);
    animation: fade 0.15s ease-out;
  }
  .modal {
    width: 100%;
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
    animation: pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    font-size: 16px;
  }
  .subtitle {
    margin-top: 3px;
    font-size: 13px;
    color: var(--text-3);
  }
  .content {
    padding: 18px 20px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: 0 0 14px 14px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
</style>
