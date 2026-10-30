<script>
  import { Printer, FileDown, LoaderCircle } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { buildPrintHtml, printHtml, PAPERS } from '../../lib/print.js';
  import { slugify } from '../../lib/download.js';
  import { app, checkedQuestions, closeModal, notify } from '../../lib/store.svelte.js';

  const PREFS_KEY = 'mqe.print';
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }
  const prefs = loadPrefs();

  let answers = $state(['none', 'inline', 'key'].includes(prefs.answers) ? prefs.answers : 'none');
  let marks = $state(prefs.marks ?? true);
  let studentFields = $state(prefs.studentFields ?? true);
  let feedback = $state(prefs.feedback ?? false);
  let paper = $state(PAPERS[prefs.paper] ? prefs.paper : 'a4');
  let scope = $state(app.checked.length ? 'checked' : 'all');
  let progress = $state(null);

  $effect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ answers, marks, studentFields, feedback, paper }));
    } catch {
      /* ignore */
    }
  });

  const questions = $derived(scope === 'checked' ? checkedQuestions() : app.quiz.questions);
  const doc = $derived(buildPrintHtml($state.snapshot(app.quiz), $state.snapshot(questions), { answers, marks, studentFields, feedback, paper }));
  const n = $derived(questions.length);

  async function pdf() {
    const suffix = answers === 'inline' ? '-answers' : answers === 'key' ? '-with-key' : '';
    const filename = `${slugify(app.quiz.name)}${suffix}.pdf`;
    progress = { done: 0, total: 0 };
    try {
      const { downloadPdf } = await import('../../lib/pdf.js');
      const pages = await downloadPdf(doc, { paper, filename, title: app.quiz.name, onProgress: (done, total) => (progress = { done, total }) });
      notify(`Downloaded ${filename} (${pages} page${pages === 1 ? '' : 's'}).`, 'success');
    } catch (e) {
      notify(`Could not make the PDF: ${e.message}`, 'error');
    } finally {
      progress = null;
    }
  }
</script>

<Modal title="Print or PDF" subtitle="A paper version of the quiz, with blank lines and answer boxes. Print it, or download it as a PDF file." width="1000px" onclose={closeModal}>
  <div class="options">
    <div class="field">
      <FieldLabel text="Correct answers" />
      <Segmented
        size="sm"
        label="Correct answers"
        bind:value={answers}
        options={[
          { value: 'none', label: 'Hide' },
          { value: 'inline', label: 'Mark in place' },
          { value: 'key', label: 'Answer key at end' },
        ]}
      />
    </div>
    <div class="field">
      <FieldLabel text="Paper" />
      <Segmented size="sm" label="Paper size" bind:value={paper} options={Object.entries(PAPERS).map(([value, p]) => ({ value, label: p.label }))} />
    </div>
    {#if app.checked.length}
      <div class="field">
        <FieldLabel text="Questions" />
        <Segmented
          size="sm"
          label="Questions to print"
          bind:value={scope}
          options={[
            { value: 'checked', label: `Selected (${app.checked.length})` },
            { value: 'all', label: `All (${app.quiz.questions.length})` },
          ]}
        />
      </div>
    {/if}
    <div class="switches">
      <Switch bind:checked={marks} label="Marks" />
      <Switch bind:checked={studentFields} label="Name / ID / date lines" />
      <Switch bind:checked={feedback} label="General feedback" disabled={answers === 'none'} />
    </div>
  </div>

  <iframe class="sheet" title="Print preview" srcdoc={doc} sandbox="allow-same-origin"></iframe>

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button class="btn" disabled={!n || !!progress} onclick={pdf}>
      {#if progress}
        <span class="spin"><LoaderCircle size={16} /></span> {progress.total ? `Page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Preparing…'}
      {:else}
        <FileDown size={16} /> Download PDF
      {/if}
    </button>
    <button class="btn btn-primary" disabled={!n} onclick={() => printHtml(doc)}><Printer size={16} /> Print {n} question{n === 1 ? '' : 's'}</button>
  {/snippet}
</Modal>

<style>
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 14px 24px;
  }
  .options .field {
    flex: none;
  }
  .switches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    padding-bottom: 6px;
  }
  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .sheet {
    width: 100%;
    height: 62vh;
    min-height: 320px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #fff;
    /* The sheet is paper: keep it white in dark mode too. */
    color-scheme: light;
  }
</style>
