<script>
  import { Monitor } from '@lucide/svelte';

  let copied = $state(false);
  const url = location.href.split('#')[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the address is shown, so it can be copied by hand */
    }
  }
</script>

<main>
  <div class="card">
    <span class="icon"><Monitor size={40} strokeWidth={1.6} /></span>
    <h1>Please use a computer</h1>
    <p>Moodler is made for a computer, with a larger screen and a keyboard. It can't be used on a phone.</p>
    <p>Open this address on a laptop or desktop computer:</p>
    <button class="link" onclick={copy}>{url.replace(/^https?:\/\//, '')}</button>
    <p class="note" aria-live="polite">{copied ? 'Copied the address.' : 'Tap the address to copy it.'}</p>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--bg);
  }
  .card {
    max-width: 380px;
    width: 100%;
    padding: 32px 24px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .icon {
    display: inline-flex;
    padding: 14px;
    border-radius: 50%;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  h1 {
    margin: 4px 0 0;
    font-size: 20px;
    color: var(--text);
  }
  p {
    margin: 0;
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.5;
  }
  .link {
    max-width: 100%;
    padding: 10px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    word-break: break-all;
    cursor: pointer;
  }
  .note {
    font-size: 12.5px;
    color: var(--text-3);
  }
</style>
