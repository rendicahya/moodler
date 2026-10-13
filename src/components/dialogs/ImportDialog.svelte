<script>
  import { Upload, ClipboardPaste, FileText, TriangleAlert, CircleCheck } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { FORMATS, FORMAT_MAP, detectFormat } from '../../lib/formats/index.js';
  import { TYPE_MAP, questionTitle } from '../../lib/model.js';
  import { app, applyImport, closeModal, notify } from '../../lib/store.svelte.js';

  let source = $state('file');
  let text = $state('');
  let filename = $state('');
  let format = $state('auto');
  let mode = $state(app.quiz.questions.length ? 'append' : 'replace');
  let dragging = $state(false);
  let fileInput = $state();

  const detected = $derived(text.trim() ? detectFormat(text, filename) : null);
  const effective = $derived(format === 'auto' ? detected : format);

  const parsed = $derived.by(() => {
    if (!text.trim() || !effective) return null;
    try {
      return { result: FORMAT_MAP[effective].import(text) };
    } catch (e) {
      return { error: e.message };
    }
  });

  async function readFile(file) {
    if (!file) return;
    filename = file.name;
    text = await file.text();
  }

  function ondrop(e) {
    e.preventDefault();
    dragging = false;
    readFile(e.dataTransfer.files[0]);
  }

  function doImport() {
    if (!parsed?.result) return;
    const n = applyImport(parsed.result, mode);
    closeModal();
    notify(`Imported ${n} question${n === 1 ? '' : 's'} from ${FORMAT_MAP[effective].label}.`, 'success');
    if (parsed.result.warnings.length) notify(`${parsed.result.warnings.length} warning(s) during import — see the import dialog for details.`, 'warning', 6000);
  }

  const counts = $derived.by(() => {
    const c = {};
    for (const q of parsed?.result?.questions ?? []) c[q.type] = (c[q.type] || 0) + 1;
    return Object.entries(c);
  });
</script>

<Modal title="Import questions" subtitle="Load questions from a file or paste them as text." width="760px" onclose={closeModal}>
  <div class="row">
    <Segmented
      bind:value={source}
      label="Source"
      options={[
        { value: 'file', label: 'Upload file', icon: Upload },
        { value: 'paste', label: 'Paste text', icon: ClipboardPaste },
      ]}
    />
    <div class="field fmt">
      <select class="select select-sm" bind:value={format} aria-label="Format">
        <option value="auto">Auto-detect format{detected ? ` (${FORMAT_MAP[detected].label})` : ''}</option>
        {#each FORMATS.filter((f) => f.import) as f}<option value={f.id}>{f.label}</option>{/each}
      </select>
    </div>
  </div>

  {#if source === 'file'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop"
      class:dragging
      ondragover={(e) => (e.preventDefault(), (dragging = true))}
      ondragleave={() => (dragging = false)}
      {ondrop}
    >
      {#if filename}
        <FileText size={28} />
        <strong>{filename}</strong>
        <span class="hint">{text.length.toLocaleString()} characters</span>
      {:else}
        <Upload size={28} />
        <strong>Drop a file here</strong>
        <span class="hint">Moodle XML (.xml), GIFT / Aiken (.txt, .gift) or project (.json)</span>
      {/if}
      <button class="btn btn-sm" onclick={() => fileInput.click()}>Choose file…</button>
      <input bind:this={fileInput} type="file" accept=".xml,.txt,.gift,.json,.aiken,text/*" hidden onchange={(e) => readFile(e.currentTarget.files[0])} />
    </div>
  {:else}
    <textarea
      class="textarea mono"
      rows="12"
      bind:value={text}
      oninput={() => (filename = '')}
      placeholder={'::Capital:: What is the capital of France? {=Paris ~London ~Berlin}\n\nThe sky is blue. {T}'}
      spellcheck="false"
    ></textarea>
  {/if}

  {#if parsed}
    {#if parsed.error}
      <div class="msg error"><TriangleAlert size={16} /> <span>{parsed.error}</span></div>
    {:else}
      {@const r = parsed.result}
      <div class="summary">
        <div class="msg {r.questions.length ? 'ok' : 'error'}">
          {#if r.questions.length}<CircleCheck size={16} />{:else}<TriangleAlert size={16} />{/if}
          <span>
            Found <strong>{r.questions.length}</strong> question{r.questions.length === 1 ? '' : 's'} ({FORMAT_MAP[effective].label}){counts.length ? ':' : '.'}
            {#each counts as [type, n], i}{i ? ', ' : ' '}{n} {TYPE_MAP[type]?.label.toLowerCase() ?? type}{/each}
          </span>
        </div>
        {#if r.warnings.length}
          <div class="msg warn">
            <TriangleAlert size={16} />
            <ul>
              {#each r.warnings.slice(0, 20) as w}<li>{w}</li>{/each}
              {#if r.warnings.length > 20}<li>…and {r.warnings.length - 20} more</li>{/if}
            </ul>
          </div>
        {/if}
        {#if r.questions.length}
          <ol class="list">
            {#each r.questions.slice(0, 50) as q}
              <li><span class="badge">{TYPE_MAP[q.type]?.short}</span> {questionTitle(q)}</li>
            {/each}
            {#if r.questions.length > 50}<li class="hint">…and {r.questions.length - 50} more</li>{/if}
          </ol>
        {/if}
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if app.quiz.questions.length}
      <div class="mode">
        <Segmented
          bind:value={mode}
          size="sm"
          label="Import mode"
          options={[
            { value: 'append', label: 'Add to quiz' },
            { value: 'replace', label: 'Replace quiz' },
          ]}
        />
      </div>
    {/if}
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button class="btn btn-primary" disabled={!parsed?.result?.questions.length} onclick={doImport}>
      Import {parsed?.result?.questions.length || ''} question{parsed?.result?.questions.length === 1 ? '' : 's'}
    </button>
  {/snippet}
</Modal>

<style>
  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .fmt {
    min-width: 260px;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 32px 20px;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--text-2);
    text-align: center;
    transition: border-color 0.12s, background 0.12s;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .drop :global(svg) {
    color: var(--text-3);
  }
  .drop .btn {
    margin-top: 6px;
  }
  .summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: var(--radius);
    font-size: 13px;
  }
  .msg :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .msg.ok {
    background: var(--success-soft);
    color: var(--success);
  }
  .msg.ok span {
    color: var(--text);
  }
  .msg.error {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .msg.warn {
    background: var(--warning-soft);
    color: var(--warning);
  }
  .msg ul {
    margin: 0;
    padding-left: 16px;
    color: var(--text-2);
  }
  .list {
    margin: 0;
    padding: 8px 8px 8px 34px;
    max-height: 200px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
  }
  .list li {
    padding: 2px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode {
    margin-right: auto;
  }
</style>
