<script>
  import { CircleQuestionMark } from '@lucide/svelte';

  let { text, label = 'More information' } = $props();

  const id = `tip-${Math.random().toString(36).slice(2, 10)}`;
  let btn = $state();
  let open = $state(false);
  let pos = $state({ x: 0, y: 0, below: false });

  // The tooltip is fixed-positioned so scrolling panes and cards don't clip it.
  function show() {
    const r = btn.getBoundingClientRect();
    const below = r.top < 140;
    const half = Math.min(150, window.innerWidth / 2 - 8);
    pos = { x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: below ? r.bottom + 8 : r.top - 8, below };
    open = true;
  }
  const hide = () => (open = false);

  $effect(() => {
    if (!open) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  });
</script>

<button
  bind:this={btn}
  type="button"
  class="info"
  aria-label={label}
  aria-describedby={open ? id : undefined}
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={() => btn.matches(':focus-visible') && show()}
  onblur={hide}
  onclick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    open ? hide() : show();
  }}
  onkeydown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), hide())}><CircleQuestionMark size={13} /></button
>
{#if open}
  <span {id} role="tooltip" class="tip" class:below={pos.below} style:left="{pos.x}px" style:top="{pos.y}px">{text}</span>
{/if}

<style>
  .info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-3);
    cursor: help;
    flex: none;
    vertical-align: middle;
  }
  .info:hover,
  .info:focus-visible {
    color: var(--accent);
    outline: none;
  }
  .info:focus-visible {
    box-shadow: var(--focus);
  }
  .tip {
    position: fixed;
    z-index: 1000;
    width: max-content;
    max-width: min(300px, calc(100vw - 16px));
    transform: translate(-50%, -100%);
    padding: 8px 11px;
    border-radius: 8px;
    background: var(--text);
    color: var(--bg);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.45;
    text-transform: none;
    letter-spacing: normal;
    white-space: normal;
    text-align: left;
    box-shadow: var(--shadow-lg);
    pointer-events: none;
    animation: tip-in 0.12s ease-out;
  }
  .tip.below {
    transform: translate(-50%, 0);
  }
  @keyframes tip-in {
    from {
      opacity: 0;
    }
  }
</style>
