<script module>
  // Students marked so far, kept while the app is open so that closing the dialog loses nothing.
  let marked = $state({ quiz: null, students: [] });
</script>

<script>
  import { Camera, UserPlus, Trash2, FileDown, LoaderCircle, ArrowLeft } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { app, library, checkedQuestions, closeModal, openModal, notify } from '../../lib/store.svelte.js';
  import { loadPrintPrefs, examSetup, sheetItems, parseTyped, formatAnswers, markSheet, VERSION_LABELS } from '../../lib/exam.js';
  import { sheetSize, PAPERS } from '../../lib/print.js';
  import { downloadText, slugify } from '../../lib/download.js';
  import { round, uid } from '../../lib/model.js';

  const prefs = loadPrintPrefs();
  if (marked.quiz !== library.activeId) Object.assign(marked, { quiz: library.activeId, students: [] });

  let scope = $state(app.checked.length ? 'checked' : 'all');
  let scanning = $state(null);
  let fileInput = $state();

  const questions = $derived($state.snapshot(scope === 'checked' ? checkedQuestions() : app.quiz.questions));
  const setup = $derived(examSetup(questions, prefs));
  const count = $derived(setup.versions.length);
  // The questions on the sheet in the quiz's own order, numbered as on an unshuffled paper, for the CSV columns.
  const columns = $derived(sheetItems(questions));

  const results = $derived(
    marked.students.map((s) => {
      const items = setup.items[s.version] ?? [];
      const answers = parseTyped(s.text, items);
      const given = s.text.trim() ? (/[\s,;]/.test(s.text.trim()) ? s.text.trim().split(/[\s,;]+/).length : s.text.trim().length) : 0;
      return { ...markSheet(items, answers), given, total: items.length };
    })
  );
  const average = $derived(results.length ? round(results.reduce((s, r) => s + r.score, 0) / results.length, 2) : 0);
  const max = $derived(results[0]?.max ?? markSheet(setup.items[0] ?? [], []).max);

  function addStudent(fields = {}) {
    marked.students.push({ id: uid(), name: '', version: 0, text: '', doubtful: [], warning: '', pages: [], ...fields });
  }

  const keyText = (v) => formatAnswers(setup.items[v].map((item) => new Set(item.fractions.map((f, k) => (f > 0 ? k : -1)).filter((k) => k >= 0))), setup.items[v]);

  async function scan(files) {
    if (!files?.length) return;
    const { loadGray, readSheet } = await import('../../lib/omr.js');
    const size = sheetSize(prefs.paper);
    let read = 0;
    let doubts = 0;
    for (let i = 0; i < files.length; i++) {
      scanning = { done: i, total: files.length };
      const file = files[i];
      try {
        const img = await loadGray(file);
        const r = readSheet(img, { versions: setup.items, size, check: setup.check });
        const items = setup.items[r.version];
        const number = (index) => items[index].number;
        const warning = r.checkOk ? '' : 'This sheet was printed for other questions or version settings, so its answers may not match.';
        // A further sheet of a student's answers goes with the sheets before it.
        const into = r.page > 0 ? marked.students.findLast((s) => s.version === r.version && !s.pages.includes(r.page)) : null;
        const student = into ?? { name: file.name.replace(/\.[^.]+$/, ''), version: r.version, text: formatAnswers([], items), doubtful: [], warning: '', pages: [] };
        const answers = parseTyped(student.text, items);
        for (const [index, picked] of Object.entries(r.answers)) answers[index] = picked;
        const fields = {
          text: formatAnswers(answers, items),
          doubtful: [...student.doubtful, ...r.doubtful.map(number)].sort((a, b) => a - b),
          warning: student.warning || warning,
          pages: [...student.pages, r.page],
        };
        if (into) Object.assign(into, fields);
        else addStudent({ ...student, ...fields });
        read++;
        if (r.doubtful.length || warning) doubts++;
      } catch (e) {
        notify(`${file.name}: ${e.message}`, 'error', 8000);
      }
    }
    scanning = null;
    if (read) notify(`Read ${read} sheet${read === 1 ? '' : 's'}.${doubts ? ` ${doubts} of them need${doubts === 1 ? 's' : ''} a second look: see the notes under their answers.` : ''}`, doubts ? 'warning' : 'success', doubts ? 8000 : 4000);
  }

  function remove(s) {
    marked.students = marked.students.filter((x) => x !== s);
  }

  const csvCell = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

  function downloadCsv() {
    const head = ['Student', ...(count > 1 ? ['Version'] : []), 'Score', 'Out of', ...columns.map((c) => `Q${c.number}`)];
    const rows = marked.students.map((s, i) => {
      const items = setup.items[s.version] ?? [];
      const per = new Map(items.map((item, k) => [item.q.id, results[i].perItem[k]]));
      return [s.name || `Student ${i + 1}`, ...(count > 1 ? [VERSION_LABELS[s.version]] : []), results[i].score, results[i].max, ...columns.map((c) => per.get(c.q.id) ?? '')];
    });
    const name = `${slugify(app.quiz.name)}-marks.csv`;
    downloadText([head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'), name, 'text/csv');
    notify(`Downloaded ${name}.`, 'success');
  }

  const settings = $derived(
    [
      count > 1 ? `${count} versions (A–${VERSION_LABELS[count - 1]})${prefs.shuffleQuestions || prefs.shuffleAnswers ? `, ${[prefs.shuffleQuestions && 'questions', prefs.shuffleAnswers && 'answers'].filter(Boolean).join(' and ')} shuffled` : ''}` : 'One version',
      `${PAPERS[prefs.paper].label} paper`,
      `${columns.length} question${columns.length === 1 ? '' : 's'} on the sheet`,
    ].join(' · ')
  );
</script>

<Modal title="Mark answer sheets" subtitle="Type in each student's answers, or read photos of their answer sheets, and get their scores." width="900px" onclose={closeModal}>
  <div class="top">
    <p class="settings">
      {settings}. <button class="link" onclick={() => openModal('print')}><ArrowLeft size={13} /> Change in Print</button>
    </p>
    {#if app.checked.length}
      <div class="field">
        <FieldLabel text="Questions" />
        <Segmented
          size="sm"
          label="Questions on the sheets"
          bind:value={scope}
          options={[
            { value: 'checked', label: `Selected (${app.checked.length})` },
            { value: 'all', label: `All (${app.quiz.questions.length})` },
          ]}
        />
      </div>
    {/if}
  </div>

  {#if !columns.length}
    <p class="note">This quiz has no multiple-choice or true/false questions with 2 to 8 answers to mark.</p>
  {:else}
    <details class="keys">
      <summary>Answer key{count > 1 ? 's' : ''}</summary>
      {#each setup.items as _, v (v)}
        <p><strong>{count > 1 ? `Version ${VERSION_LABELS[v]}` : 'Key'}:</strong> <code>{keyText(v)}</code></p>
      {/each}
    </details>

    <div class="actions">
      <button class="btn btn-primary" disabled={!!scanning} onclick={() => fileInput.click()}>
        {#if scanning}
          <span class="spin"><LoaderCircle size={16} /></span> Reading {scanning.done + 1} of {scanning.total}…
        {:else}
          <Camera size={16} /> Read photos of sheets
        {/if}
      </button>
      <input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={(e) => (scan([...e.currentTarget.files]), (e.currentTarget.value = ''))} />
      <button class="btn" onclick={() => addStudent()}><UserPlus size={16} /> Type a student's answers</button>
      <span class="tip">Photos: the whole sheet, straight on, in good light. Typing: one letter per question, like <code>ABDCA</code>, or with spaces for more letters, like <code>A BD C</code>; <code>-</code> for no answer.</span>
    </div>

    {#if marked.students.length}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              {#if count > 1}<th>Version</th>{/if}
              <th>Answers</th>
              <th class="num">Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each marked.students as s, i (s.id)}
              {@const r = results[i]}
              <tr>
                <td><input class="input input-sm" aria-label="Student" placeholder="Student {i + 1}" bind:value={s.name} /></td>
                {#if count > 1}
                  <td>
                    <select class="input input-sm" aria-label="Version" bind:value={s.version}>
                      {#each setup.versions as v, k (k)}<option value={k}>{v.label}</option>{/each}
                    </select>
                  </td>
                {/if}
                <td class="answers">
                  <input class="input input-sm mono" aria-label="Answers" placeholder="{r.total} answers" spellcheck="false" bind:value={s.text} />
                  {#if r.given && r.given !== r.total}<span class="warn">{r.given} of {r.total} answers</span>{/if}
                  {#if s.doubtful.length}<span class="warn">Check {s.doubtful.length === 1 ? 'question' : 'questions'} {s.doubtful.join(', ')}: a faint mark or more than one answer.</span>{/if}
                  {#if s.warning}<span class="warn">{s.warning}</span>{/if}
                </td>
                <td class="num"><strong>{r.score}</strong> / {r.max}</td>
                <td><button class="btn btn-ghost btn-icon" title="Remove" aria-label="Remove {s.name || `student ${i + 1}`}" onclick={() => remove(s)}><Trash2 size={15} /></button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="summary">{marked.students.length} student{marked.students.length === 1 ? '' : 's'} · average {average} / {max}. Only the questions on the answer sheet are marked here; mark the others by hand.</p>
    {:else}
      <p class="note">No students yet.</p>
    {/if}
  {/if}

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Close</button>
    <button class="btn btn-primary" disabled={!marked.students.length} onclick={downloadCsv}><FileDown size={16} /> Download marks (CSV)</button>
  {/snippet}
</Modal>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px 20px;
  }
  .settings,
  .note,
  .summary {
    margin: 0;
    font-size: 13px;
    color: var(--text-2);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .keys {
    font-size: 13px;
  }
  .keys summary {
    cursor: pointer;
    color: var(--text-2);
  }
  .keys p {
    margin: 6px 0 0;
    overflow-wrap: anywhere;
  }
  code,
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }
  .tip {
    flex: 1 1 260px;
    font-size: 12px;
    color: var(--text-3);
  }
  .table-wrap {
    max-height: 46vh;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-2, var(--surface));
    text-align: left;
    font-weight: 500;
    color: var(--text-2);
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:last-child td {
    border-bottom: none;
  }
  td .input {
    width: 100%;
    min-width: 90px;
  }
  .answers {
    width: 55%;
  }
  .answers .warn {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: var(--warning);
  }
  .num {
    text-align: right;
    white-space: nowrap;
    padding-top: 10px;
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
  /* On a phone each student is a card: name, version, score and remove on top, the answers below. */
  @media (max-width: 640px) {
    thead {
      display: none;
    }
    tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      align-items: center;
      gap: 6px;
      padding: 8px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 0;
      border: none;
    }
    td .input {
      min-width: 0;
    }
    .answers {
      grid-column: 1 / -1;
      grid-row: 2;
      width: auto;
    }
    .num {
      padding-top: 0;
    }
  }
</style>
