<script>
  import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@lucide/svelte';
  import { app, dismissToast } from '../../lib/store.svelte.js';

  const ICONS = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    {@const Icon = ICONS[t.kind] || Info}
    <div class="toast {t.kind}" role="status">
      <Icon size={18} />
      <span>{t.message}</span>
      {#if t.action}
        <button class="btn btn-sm action" onclick={() => (t.action.run(), dismissToast(t.id))}>{t.action.label}</button>
      {/if}
      <button class="btn btn-ghost btn-icon btn-sm" onclick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 40px));
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 8px 10px 14px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    font-size: 13.5px;
    animation: slide 0.2s ease-out;
  }
  .toast span {
    flex: 1;
  }
  .action {
    flex: none;
  }
  .toast :global(svg:first-child) {
    flex: none;
  }
  .success :global(svg:first-child) {
    color: var(--success);
  }
  .error :global(svg:first-child) {
    color: var(--danger);
  }
  .warning :global(svg:first-child) {
    color: var(--warning);
  }
  .info :global(svg:first-child) {
    color: var(--accent);
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
