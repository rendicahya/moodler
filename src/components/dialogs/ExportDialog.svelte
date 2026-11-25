<script>
  import { Download, Copy, TriangleAlert, Check, CircleCheck, ArrowRight, ListChecks, FileDown } from '@lucide/svelte';
  import { checkWarnings } from '../../lib/checks.js';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { questionTitle, validateQuestion, TYPE_MAP } from '../../lib/model.js';
  import { TYPE_ICONS } from '../../lib/icons.js';
  import { FORMATS, FORMAT_MAP } from '../../lib/formats/index.js';
  import { app, library, closeModal, openModal, notify, markBackedUp, select } from '../../lib/store.svelte.js';
  import { downloadText, slugify } from '../../lib/download.js';

  const exportable = FORMATS.filter((f) => f.export);
  let format = $state(localStorageGet('mqe.exportFormat') || 'xml');
  // Questions ticked in the list are pre-selected; otherwise start with the question open in the editor.
  let scope = $state(app.checked.length ? 'picked' : 'all');
  let picked = $state(app.checked.length ? [...app.checked] : app.selectedId ? [app.selectedId] : []);
  // ExamView imports a file either as a test or as a question bank, which the file itself has to say.
  let examviewType = $state(localStorageGet('mqe.examviewType') === 'bank' ? 'bank' : 'test');
  $effect(() => {
    try {
      localStorage.setItem('mqe.examviewType', examviewType);
    } catch {
      /* ignore */
    }
  });
  let copied = $state(false);
  // The file itself is hidden until asked for, and stays open for the next export once opened.
  let showFile = $state(localStorageGet('mqe.exportShowFile') === '1');
  $effect(() => {
    try {
      localStorage.setItem('mqe.exportShowFile', showFile ? '1' : '0');
    } catch {
      /* ignore */
    }
  });

  function localStorageGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  const slug = $derived(slugify(app.quiz.name));
  let filename = $state('');
  const fmt = $derived(FORMAT_MAP[format]);
  const defaultName = $derived(`${slug}${fmt.suffix ?? ''}.${fmt.ext}`);

  // When the quiz is tracked for review, every question not left to review counts as reviewed (as in the sidebar).
  const reviewTracked = $derived(!app.quiz.noReview && app.quiz.questions.some((q) => q.unreviewed || q.reviewed));
  const reviewed = $derived(reviewTracked ? app.quiz.questions.filter((q) => !q.unreviewed) : []);
  const questions = $derived(
    scope === 'picked' ? app.quiz.questions.filter((q) => picked.includes(q.id)) : scope === 'reviewed' ? reviewed : app.quiz.questions
  );
  const allPicked = $derived(app.quiz.questions.length > 0 && picked.length === app.quiz.questions.length);
  const reviewedPicked = $derived(reviewed.length > 0 && reviewed.length === picked.length && reviewed.every((q) => picked.includes(q.id)));
  $effect(() => {
    if (scope === 'reviewed' && !reviewTracked) scope = 'all';
  });

  function togglePick(id) {
    picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
  }
  const output = $derived.by(() => {
    try {
      return fmt.export($state.snapshot(app.quiz), $state.snapshot(questions), { type: examviewType });
    } catch (e) {
      return { text: '', warnings: [`Export failed: ${e.message}`] };
    }
  });
  const size = $derived(new Blob([output.text]).size);

  // Questions about to be exported that Moodle may reject or that would not work as intended.
  const problems = $derived(
    questions.map((q) => ({ q, n: app.quiz.questions.indexOf(q) + 1, issues: validateQuestion(q) })).filter((p) => p.issues.length)
  );

  // Not errors, but worth a look before the questions reach students.
  const notes = $derived.by(() => {
    const list = [];
    const toReview = questions.filter((q) => q.unreviewed).length;
    if (toReview) list.push(`${toReview} question${toReview === 1 ? ' has' : 's have'} not been reviewed yet.`);
    for (const w of checkWarnings(questions)) list.push(w.text);
    return list;
  });

  function fix(id) {
    closeModal();
    app.search = '';
    app.tab = 'edit';
    select(id);
  }

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
    const name = filename.trim() || defaultName;
    downloadText(output.text, name, fmt.mime);
    // A full JSON or Moodle XML file can restore the whole quiz, so it counts as a backup when it is the only quiz.
    if ((format === 'json' || format === 'xml') && questions.length === app.quiz.questions.length && library.quizzes.length < 2) markBackedUp();
    notify(`Downloaded ${name}.`, 'success');
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

<Modal title="Export questions" subtitle={format === 'examview' ? 'Download a file you can import into ExamView Test Generator.' : 'Download a file you can import into Moodle’s question bank (Question bank → Import).'} width="860px" onclose={closeModal}>
  <div class="format-pick">
    <div class="formats" role="radiogroup" aria-label="Format">
      {#each exportable as f}
        <button class="fmt" class:on={format === f.id} role="radio" aria-checked={format === f.id} title={f.description} onclick={() => choose(f.id)}>{f.label}</button>
      {/each}
    </div>
    <p class="desc">{fmt.description}</p>
  </div>

  <div class="opts">
    <div class="field grow">
      <label for="export-name">File name</label>
      <input id="export-name" class="input input-sm mono" bind:value={filename} placeholder={defaultName} />
    </div>
    <div class="field">
      <span class="field-label">Questions</span>
      <Segmented
        options={[
          { value: 'all', label: `All (${app.quiz.questions.length})` },
          ...(reviewTracked ? [{ value: 'reviewed', label: `Reviewed (${reviewed.length})` }] : []),
          { value: 'picked', label: `Selected (${picked.length})` },
        ]}
        label="Questions to export"
        size="sm"
        bind:value={scope}
      />
    </div>
    {#if format === 'examview'}
      <div class="field">
        <span class="field-label">Import in ExamView as</span>
        <Segmented
          options={[
            { value: 'test', label: 'Test', title: 'For File → Import in the Test Builder' },
            { value: 'bank', label: 'Question bank', title: 'For File → Import in the Question Bank Editor' },
          ]}
          label="Import in ExamView as"
          size="sm"
          bind:value={examviewType}
        />
      </div>
    {:else if format !== 'aiken' && format !== 'json'}
      <Switch bind:checked={app.quiz.includeCategory} label="Include category" />
    {/if}
  </div>

  {#if scope === 'picked'}
    <div class="pick">
      <div class="pick-head">
        <label class="check">
          <input
            type="checkbox"
            checked={allPicked}
            indeterminate={picked.length > 0 && !allPicked}
            onchange={() => (picked = allPicked ? [] : app.quiz.questions.map((q) => q.id))}
          />
          Select all
        </label>
        {#if reviewTracked}
          <button
            class="btn btn-ghost btn-sm pick-reviewed"
            title="Select only the questions that have been reviewed"
            disabled={!reviewed.length || reviewedPicked}
            onclick={() => (picked = reviewed.map((q) => q.id))}
          >
            <CircleCheck size={14} /> Select reviewed
          </button>
        {/if}
        <span class="hint">{picked.length} of {app.quiz.questions.length} selected</span>
      </div>
      <ul class="pick-list" aria-label="Questions to export">
        {#each app.quiz.questions as q, i (q.id)}
          {@const Icon = TYPE_ICONS[q.type]}
          <li>
            <label class="check">
              <input type="checkbox" checked={picked.includes(q.id)} onchange={() => togglePick(q.id)} />
              <span class="pick-num">{i + 1}</span>
              <span class="pick-icon" title={TYPE_MAP[q.type].label}><Icon size={14} /></span>
              <span class="pick-name">{questionTitle(q)}</span>
              {#if reviewTracked && !q.unreviewed}<span class="pick-done" title="Reviewed"><CircleCheck size={14} /></span>{/if}
            </label>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if questions.length}
    {#if problems.length}
      <div class="check bad">
        <div class="check-head">
          <TriangleAlert size={16} />
          <strong>{problems.length} of {questions.length} question{questions.length === 1 ? '' : 's'} need{problems.length === 1 ? 's' : ''} attention before import</strong>
        </div>
        <ul class="problems">
          {#each problems as { q, n, issues } (q.id)}
            <li>
              <span class="pick-num">{n}</span>
              <span class="problem">
                <span class="pick-name">{questionTitle(q)}</span>
                <span class="issue-text">{issues.join(' ')}</span>
              </span>
              <button class="btn btn-sm" onclick={() => fix(q.id)}>Fix <ArrowRight size={14} /></button>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <div class="check ok"><CircleCheck size={16} /> All {questions.length} question{questions.length === 1 ? '' : 's'} passed the checks.</div>
    {/if}
  {/if}

  {#if questions.length && notes.length}
    <div class="notes">
      <ListChecks size={16} />
      <details>
        <summary>{notes.length} thing{notes.length === 1 ? '' : 's'} worth a look before students see these questions</summary>
        <ul>
          {#each notes as note}<li>{note}</li>{/each}
        </ul>
      </details>
      <button class="btn btn-sm" onclick={() => openModal('check')}>Check <ArrowRight size={14} /></button>
    </div>
  {/if}

  {#if output.warnings.length}
    <div class="warn">
      <TriangleAlert size={16} />
      <div>
        <strong>{output.warnings.length} issue{output.warnings.length === 1 ? '' : 's'}</strong>
        <ul>
          {#each output.warnings.slice(0, 15) as w}<li class="signs">{w}</li>{/each}
          {#if output.warnings.length > 15}<li>…and {output.warnings.length - 15} more</li>{/if}
        </ul>
      </div>
    </div>
  {/if}

  <details class="out" bind:open={showFile}>
    <summary class="out-head">
      <span>Show the file</span>
      <span class="hint">{formatSize(size)}</span>
    </summary>
    {#if showFile}
      <textarea class="textarea mono" readonly rows="14" value={output.text.length > 200000 ? output.text.slice(0, 200000) + '\n… (truncated preview)' : output.text}></textarea>
    {/if}
  </details>

  {#snippet footer()}
    <button class="btn btn-ghost pdf-link" title="A paper version to print or download as a Word (.docx) or PDF file" onclick={() => openModal('print')}><FileDown size={16} /> Word / PDF / print…</button>
    <button class="btn" onclick={copy} disabled={!questions.length || !output.text}>
      {#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy{/if}
    </button>
    <button class="btn btn-primary" onclick={download} disabled={!questions.length || !output.text.trim()}><Download size={16} /> Download</button>
  {/snippet}
</Modal>

<style>
  .format-pick {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .formats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  @media (max-width: 560px) {
    .formats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .fmt {
    padding: 7px 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
  }
  .fmt:hover {
    border-color: var(--border-strong);
  }
  .fmt:focus-visible {
    outline: none;
    box-shadow: var(--focus);
  }
  .fmt.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-text);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .desc {
    margin: 0;
    font-size: 12.5px;
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
  .pick {
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .pick-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    font-weight: 600;
  }
  .hint {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
  }
  .pick-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    cursor: pointer;
  }
  .pick-list .check {
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 13px;
  }
  .pick-list .check:hover {
    background: var(--hover);
  }
  .check input {
    accent-color: var(--accent);
    flex: none;
  }
  .pick-num {
    flex: none;
    min-width: 18px;
    text-align: right;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .pick-icon {
    flex: none;
    display: inline-flex;
    color: var(--text-2);
  }
  .pick-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-list .pick-name {
    flex: 1;
  }
  .pick-done {
    flex: none;
    display: inline-flex;
    color: var(--success);
  }
  .pick-head .pick-reviewed {
    margin-left: auto;
    margin-right: 8px;
    font-weight: 500;
  }
  .check {
    flex: none;
    border-radius: var(--radius);
    font-size: 13px;
  }
  .check.ok {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--success-soft);
    color: var(--success);
  }
  .check.bad {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    cursor: default;
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    overflow: hidden;
  }
  .check-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--warning-soft);
    color: var(--warning);
  }
  .problems {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 180px;
    overflow-y: auto;
  }
  .problems li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border-radius: 6px;
  }
  .problems li:hover {
    background: var(--hover);
  }
  .problem {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .issue-text {
    font-size: 12px;
    color: var(--text-2);
  }
  .notes {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 13px;
  }
  .notes :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .notes details {
    flex: 1;
    min-width: 0;
    padding-top: 3px;
  }
  .notes summary {
    cursor: pointer;
    color: var(--text);
  }
  .notes ul {
    margin: 6px 0 0;
    padding-left: 16px;
    color: var(--text);
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
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
    cursor: pointer;
    list-style: none;
  }
  .out-head::-webkit-details-marker {
    display: none;
  }
  .out-head::before {
    content: '';
    width: 6px;
    height: 6px;
    margin: 0 4px 0 2px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 0.12s;
  }
  .out[open] .out-head::before {
    transform: rotate(45deg);
  }
  .out-head .hint {
    margin-left: auto;
  }
  .pdf-link {
    margin-right: auto;
  }
  textarea {
    white-space: pre;
    background: var(--surface-2);
  }
  /* Otherwise the font draws => and the like as one sign. */
  .signs {
    font-variant-ligatures: none;
  }
</style>
