<script>
  import { Printer, FileDown, FileText, LoaderCircle, ClipboardCheck } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { buildPrintHtml, printHtml, PAPERS } from '../../lib/print.js';
  import { loadPrintPrefs, savePrintPrefs, examSetup, VERSION_LABELS } from '../../lib/exam.js';
  import { downloadBlob, slugify } from '../../lib/download.js';
  import { app, checkedQuestions, closeModal, openModal, notify } from '../../lib/store.svelte.js';

  const prefs = loadPrintPrefs();

  let answers = $state(prefs.answers);
  let marks = $state(prefs.marks);
  let studentFields = $state(prefs.studentFields);
  let feedback = $state(prefs.feedback);
  let paper = $state(prefs.paper);
  let versions = $state(prefs.versions);
  let shuffleQuestions = $state(prefs.shuffleQuestions);
  let shuffleAnswers = $state(prefs.shuffleAnswers);
  let sheet = $state(prefs.sheet);
  // Which version is shown and printed: an index into the versions, or 'all'.
  let shown = $state('all');
  let scope = $state(app.checked.length ? 'checked' : 'all');
  let progress = $state(null);
  let makingWord = $state(false);

  $effect(() => savePrintPrefs({ answers, marks, studentFields, feedback, paper, versions, shuffleQuestions, shuffleAnswers, sheet }));
  $effect(() => {
    if (shown !== 'all' && shown >= versions) shown = 'all';
  });

  const questions = $derived(scope === 'checked' ? checkedQuestions() : app.quiz.questions);
  const setup = $derived(examSetup($state.snapshot(questions), { versions, shuffleQuestions, shuffleAnswers }));
  const printed = $derived(versions > 1 && shown !== 'all' ? [setup.versions[shown]] : setup.versions);
  const doc = $derived(buildPrintHtml($state.snapshot(app.quiz), [], { answers, marks, studentFields, feedback, paper, versions: printed, sheet, check: setup.check }));
  const n = $derived(questions.length);
  const sheetCount = $derived(setup.items[0]?.length ?? 0);

  function fileName(ext) {
    const suffix = [versions > 1 && shown !== 'all' ? `-version-${VERSION_LABELS[shown].toLowerCase()}` : '', sheet === 'only' ? '-answer-sheet' : '', answers === 'inline' ? '-answers' : answers === 'key' ? '-with-key' : ''].join('');
    return `${slugify(app.quiz.name)}${suffix}.${ext}`;
  }

  async function pdf() {
    const filename = fileName('pdf');
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

  // Answer sheets are read by their exact layout, which Word would not keep, so a Word file only has the questions.
  async function word() {
    const filename = fileName('docx');
    makingWord = true;
    try {
      const { makeDocx } = await import('../../lib/docx.js');
      const html = buildPrintHtml($state.snapshot(app.quiz), [], { answers, marks, studentFields, feedback, paper, versions: printed });
      const { blob, failed } = await makeDocx(html, { paper, title: app.quiz.name });
      downloadBlob(blob, filename);
      if (failed) notify(`Downloaded ${filename}, but ${failed} picture${failed === 1 ? '' : 's'} could not be added.`, 'error');
      else notify(`Downloaded ${filename}.`, 'success');
    } catch (e) {
      notify(`Could not make the Word file: ${e.message}`, 'error');
    } finally {
      makingWord = false;
    }
  }

  const printLabel = $derived(sheet === 'only' ? 'Print answer sheets' : versions > 1 && shown === 'all' ? `Print ${versions} versions` : `Print ${n} question${n === 1 ? '' : 's'}`);
</script>

<Modal title="Print, PDF or Word" subtitle="A paper version of the quiz, with blank lines and answer boxes. Print it, or download it as a PDF or Word file." width="1000px" onclose={closeModal}>
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

  <div class="options exam">
    <div class="field">
      <FieldLabel text="Exam versions" info="Each version has the questions, and the answers of multiple-choice questions, in another order, so students sitting side by side have different papers. Questions stay after the description that introduces them, and answers such as “All of the above” keep their place. Printing again gives the same versions while the questions stay the same." />
      <Segmented size="sm" label="Exam versions" bind:value={versions} options={[1, 2, 3, 4].map((v) => ({ value: v, label: v === 1 ? 'One' : `A–${VERSION_LABELS[v - 1]}` }))} />
    </div>
    {#if versions > 1}
      <div class="field">
        <FieldLabel text="Show" />
        <Segmented size="sm" label="Version to show" bind:value={shown} options={[...VERSION_LABELS.slice(0, versions).map((l, i) => ({ value: i, label: l })), { value: 'all', label: 'All' }]} />
      </div>
      <div class="switches">
        <Switch bind:checked={shuffleQuestions} label="Shuffle questions" />
        <Switch bind:checked={shuffleAnswers} label="Shuffle answers" />
      </div>
    {/if}
    <div class="field">
      <FieldLabel
        text="Answer sheet"
        info="A page with a circle to fill for each answer of the multiple-choice and true/false questions. Mark filled-in sheets with Mark answer sheets: type the answers in, or take photos of the sheets. With “Mark in place”, the sheet shows the correct circles filled, to lay over students’ sheets."
      />
      <Segmented
        size="sm"
        label="Answer sheet"
        bind:value={sheet}
        options={[
          { value: 'none', label: 'None' },
          { value: 'after', label: 'After the questions' },
          { value: 'only', label: 'Sheet only' },
        ]}
      />
    </div>
  </div>
  {#if sheet !== 'none' && n && !sheetCount}
    <p class="hint">This quiz has no multiple-choice or true/false questions with 2 to 8 answers, so the answer sheet is empty.</p>
  {/if}

  <iframe class="sheet" title="Print preview" srcdoc={doc} sandbox="allow-same-origin"></iframe>

  {#snippet footer()}
    <button class="btn mark" disabled={!sheetCount} title="Mark students' answer sheets: type in their answers or read photos of the sheets" onclick={() => openModal('marking')}><ClipboardCheck size={16} /> Mark answer sheets</button>
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button
      class="btn"
      disabled={!n || makingWord || sheet === 'only'}
      title={sheet === 'none' ? 'A .docx file you can edit in Word' : sheet === 'only' ? 'Answer sheets can only be printed or downloaded as PDF' : 'A .docx file you can edit in Word. It has the questions; print answer sheets from here or the PDF'}
      onclick={word}
    >
      {#if makingWord}<span class="spin"><LoaderCircle size={16} /></span> Preparing…{:else}<FileText size={16} /> Download Word{/if}
    </button>
    <button class="btn" disabled={!n || !!progress} onclick={pdf}>
      {#if progress}
        <span class="spin"><LoaderCircle size={16} /></span> {progress.total ? `Page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Preparing…'}
      {:else}
        <FileDown size={16} /> Download PDF
      {/if}
    </button>
    <button class="btn btn-primary" disabled={!n} onclick={() => printHtml(doc)}><Printer size={16} /> {printLabel}</button>
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
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--warning);
  }
  .mark {
    margin-right: auto;
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
    height: 56vh;
    min-height: 320px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #fff;
    /* The sheet is paper: keep it white in dark mode too. */
    color-scheme: light;
  }
</style>
