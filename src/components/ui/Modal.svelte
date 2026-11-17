<script>
  import { X } from '@lucide/svelte';
  import { onMount } from 'svelte';

  // `resizable` is a name under which the size a dialog is resized to is remembered in this browser.
  let { title, subtitle = '', width = '560px', onclose, children, footer, headerExtra, resizable = '' } = $props();
  let dialog;

  const sizeKey = () => `moodler-dialog-size-${resizable}`;
  let size = $state(
    (() => {
      if (!resizable) return null;
      try {
        const s = JSON.parse(localStorage.getItem(sizeKey()));
        return s?.w > 0 && s?.h > 0 ? s : null;
      } catch {
        return null;
      }
    })()
  );
  let resizing = $state(false);
  const MIN_W = 560;
  const MIN_H = 400;

  function saveSize() {
    try {
      if (size) localStorage.setItem(sizeKey(), JSON.stringify(size));
      else localStorage.removeItem(sizeKey());
    } catch {
      // Remembering the size is a convenience only.
    }
  }

  // The dialog stays centred, so it grows on both sides: twice the pointer's movement.
  function resizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const r = dialog.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    resizing = true;
    const move = (ev) => {
      const w = Math.min(Math.max(start.w + 2 * (ev.clientX - start.x), MIN_W), window.innerWidth - 48);
      const h = Math.min(Math.max(start.h + 2 * (ev.clientY - start.y), MIN_H), window.innerHeight - 48);
      size = { w: Math.round(w), h: Math.round(h) };
    };
    const end = () => {
      resizing = false;
      saveSize();
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function resetSize() {
    size = null;
    saveSize();
  }

  onMount(() => {
    const prev = document.activeElement;
    const first = dialog.querySelector('[data-autofocus]') || dialog.querySelector('input, textarea, select, button:not(.modal-close):not(.info)');
    first?.focus();
    // When nothing inside can take the focus yet (say, every button is disabled while loading), the dialog takes it,
    // so that Escape and Tab work straight away.
    if (!dialog.contains(document.activeElement)) dialog.focus();
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
  <div
    class="modal"
    class:resizing
    class:sized={!!size}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    style:max-width={size ? 'calc(100vw - 48px)' : width}
    style:width={size ? `${size.w}px` : null}
    style:height={size ? `${size.h}px` : null}
    bind:this={dialog}
  >
    <header>
      <div>
        <h2>{title}</h2>
        {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
      </div>
      {#if headerExtra}<div class="header-extra">{@render headerExtra()}</div>{/if}
      <button class="btn btn-ghost btn-icon btn-sm modal-close" onclick={onclose} aria-label="Close"><X size={18} /></button>
    </header>
    <div class="content">
      {@render children()}
    </div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
    {#if resizable}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" title="Drag to resize (double-click for the default size)" onpointerdown={resizeStart} ondblclick={resetSize}></div>
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
  .modal:focus {
    outline: none;
  }
  .modal {
    position: relative;
  }
  .modal.sized {
    max-height: calc(100vh - 48px);
    animation: none;
  }
  .modal.resizing {
    user-select: none;
  }
  .resize-handle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    touch-action: none;
    border-radius: 0 0 14px 0;
    background: linear-gradient(135deg, transparent 50%, var(--text-3) 50%, var(--text-3) 56%, transparent 56%, transparent 68%, var(--text-3) 68%, var(--text-3) 74%, transparent 74%);
    opacity: 0.55;
  }
  .resize-handle:hover,
  .resizing .resize-handle {
    opacity: 1;
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
  .header-extra {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin: -4px 0;
  }
  .subtitle {
    margin-top: 3px;
    font-size: 13px;
    color: var(--text-3);
  }
  .content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 18px 20px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
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
