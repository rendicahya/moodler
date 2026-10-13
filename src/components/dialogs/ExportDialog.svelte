<script>
  import { Download, Copy, TriangleAlert, Check } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import { FORMATS, FORMAT_MAP } from '../../lib/formats/index.js';
  import { app, closeModal, notify } from '../../lib/store.svelte.js';

  const exportable = FORMATS.filter((f) => f.export);
  let format = $state(localStorageGet('mqe.exportFormat') || 'xml');
  let onlySelected = $state(false);
  let copied = $state(false);

  function localStorageGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  const slug = $derived(
    (app.quiz.name || 'quiz')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'quiz'
  );
  let filename = $state('');
  const fmt = $derived(FORMAT_MAP[format]);
  const defaultName = $derived(`${slug}${format === 'gift' ? '-gift' : format === 'aiken' ? '-aiken' : ''}.${fmt.ext}`);

  const questions = $derived(onlySelected ? app.quiz.questions.filter((q) => q.id === app.selectedId) : app.quiz.questions);
  const output = $derived.by(() => {
    try {
      return fmt.export($state.snapshot(app.quiz), $state.snapshot(questions));
    } catch (e) {
      return { text: '', warnings: [`Export failed: ${e.message}`] };
    }
  });
  const size = $derived(new Blob([output.text]).size);

  function choose(id) {
    format = id;
    filename = '';
    try {
      localStorage.setItem('mqe.exportFormat', id);
    } catch {
      /* ignore */
    }
  }

  function download() {
    const blob = new Blob([output.text], { type: `${fmt.mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.trim() || defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Downloaded ${a.download}.`, 'success');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output.text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      notify('Could not access the clipboard. Select the text and copy it manually.', 'error');
    }
  }

  const formatSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
</script>

<Modal title="Export questions" subtitle="Download a file you can import into Moodle’s question bank (Question bank → Import)." width="860px" onclose={closeModal}>
  <div class="formats" role="radiogroup" aria-label="Format">
    {#each exportable as f}
      <button class="fmt" class:on={format === f.id} role="radio" aria-checked={format === f.id} onclick={() => choose(f.id)}>
        <span class="name">{f.label}</span>
        <span class="desc">{f.description}</span>
      </button>
    {/each}
  </div>

  <div class="opts">
    <div class="field grow">
      <label for="export-name">File name</label>
      <input id="export-name" class="input input-sm mono" bind:value={filename} placeholder={defaultName} />
    </div>
    <Switch bind:checked={onlySelected} label="Selected question only" disabled={!app.selectedId} />
    {#if format !== 'aiken' && format !== 'json'}
      <Switch bind:checked={app.quiz.includeCategory} label="Include category" />
    {/if}
  </div>

  {#if output.warnings.length}
    <div class="warn">
      <TriangleAlert size={16} />
      <div>
        <strong>{output.warnings.length} issue{output.warnings.length === 1 ? '' : 's'}</strong>
        <ul>
          {#each output.warnings.slice(0, 15) as w}<li>{w}</li>{/each}
          {#if output.warnings.length > 15}<li>…and {output.warnings.length - 15} more</li>{/if}
        </ul>
      </div>
    </div>
  {/if}

  <div class="out">
    <div class="out-head">
      <span>Preview</span>
      <span class="hint">{formatSize(size)}</span>
    </div>
    <textarea class="textarea mono" readonly rows="14" value={output.text.length > 200000 ? output.text.slice(0, 200000) + '\n… (truncated preview)' : output.text}></textarea>
  </div>

  {#snippet footer()}
    <button class="btn" onclick={copy} disabled={!output.text}>
      {#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy{/if}
    </button>
    <button class="btn btn-primary" onclick={download} disabled={!output.text.trim()}><Download size={16} /> Download</button>
  {/snippet}
</Modal>

<style>
  .formats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 760px) {
    .formats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .fmt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    text-align: left;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer;
  }
  .fmt:hover {
    border-color: var(--border-strong);
  }
  .fmt.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name {
    font-weight: 600;
  }
  .desc {
    font-size: 12px;
    color: var(--text-2);
    line-height: 1.4;
  }
  .opts {
    display: flex;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
  }
  .opts :global(.switch) {
    margin-bottom: 6px;
  }
  .grow {
    flex: 1;
    min-width: 220px;
  }
  .warn {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--warning-soft);
    color: var(--warning);
    font-size: 13px;
  }
  .warn :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .warn ul {
    margin: 2px 0 0;
    padding-left: 16px;
    color: var(--text-2);
  }
  .out {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .out-head {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
  }
  textarea {
    white-space: pre;
    background: var(--surface-2);
  }
</style>
