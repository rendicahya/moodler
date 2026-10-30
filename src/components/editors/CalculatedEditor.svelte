<script>
  import { untrack } from 'svelte';
  import { Plus, Trash, Dices } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import FractionSelect from '../ui/FractionSelect.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import Info from '../ui/Info.svelte';
  import RichText from '../RichText.svelte';
  import UnitsSection from './UnitsSection.svelte';
  import { newAnswer } from '../../lib/model.js';
  import { wildcardNames, syncDatasets, generateValues, itemValues, tryEvaluate, formatAnswer, TOLERANCE_TYPES, MAX_ITEMS } from '../../lib/calc.js';

  let { q = $bindable() } = $props();

  // Every {wildcard} in the text and formulas gets a dataset, as soon as it is typed.
  const names = $derived(wildcardNames(q).join('\n'));
  $effect(() => {
    names;
    untrack(() => syncDatasets(q));
  });

  const first = $derived(itemValues(q, 0));

  function regenerate(ds) {
    ds.items = generateValues(ds, q.itemcount);
  }
  function regenerateAll() {
    for (const ds of q.datasets) regenerate(ds);
  }
  function setCount(value) {
    q.itemcount = Math.max(1, Math.min(MAX_ITEMS, Math.round(Number(value) || 1)));
    syncDatasets(q);
  }
  const correct = $derived(q.answers.find((a) => Number(a.fraction) === 100) ?? q.answers[0]);
</script>

<Section
  title="Answer formulas"
  required
  subtitle="Write the answer as a formula using the wildcards, e.g. {'{a} * {b}'} or sqrt({'{a}'}). Responses close enough to the result get the grade."
  info="Formulas may use + - * / % ** and brackets, and functions such as sqrt(), pow(x, y), abs(), round(x, d), sin(), cos(), log(), exp() and pi(). The first formula a response matches gives its grade."
>
  {#each q.answers as a, i (a.id)}
    {@const result = String(a.text).trim() ? tryEvaluate(a.text, first) : null}
    <div class="formula">
      <div class="formula-top">
        <div class="field grow">
          <label class="label" for="formula-{a.id}">Formula {i + 1}</label>
          <input id="formula-{a.id}" class="input input-sm mono" bind:value={a.text} placeholder={'e.g. {a} * {b}'} spellcheck="false" />
          {#if result?.error}
            <span class="result bad">{result.error}</span>
          {:else if result}
            <span class="result">With the first values: <strong>{formatAnswer(result.value, a.correctanswerformat, a.correctanswerlength)}</strong></span>
          {/if}
        </div>
        <div class="field">
          <span class="label">Grade</span>
          <FractionSelect bind:value={a.fraction} />
        </div>
        <button class="btn btn-ghost btn-icon btn-sm danger remove" title="Remove" aria-label="Remove formula {i + 1}" disabled={q.answers.length < 2} onclick={() => q.answers.splice(i, 1)}><Trash size={15} /></button>
      </div>
      <div class="formula-opts">
        <div class="field">
          <span class="label">Tolerance <Info text="How far a response may be from the result and still count. Relative: a share of the result (0.01 = 1%). Nominal: a fixed amount (± 0.5)." label="About tolerance" /></span>
          <div class="pair">
            <span class="pm">±</span>
            <input class="input input-sm mono" type="number" step="any" min="0" bind:value={a.tolerance} aria-label="Tolerance for formula {i + 1}" />
            <select class="select select-sm" bind:value={a.tolerancetype} aria-label="Tolerance type for formula {i + 1}">
              {#each TOLERANCE_TYPES as t}<option value={t.value} title={t.help}>{t.label}</option>{/each}
            </select>
          </div>
        </div>
        <div class="field">
          <span class="label">Correct answer shows <Info text="How Moodle displays the correct answer to students after the attempt." label="About the answer display" /></span>
          <div class="pair">
            <select class="select select-sm" bind:value={a.correctanswerlength} aria-label="Digits for formula {i + 1}">
              {#each Array.from({ length: 10 }, (_, n) => n) as n}<option value={n}>{n}</option>{/each}
            </select>
            <select class="select select-sm" bind:value={a.correctanswerformat} aria-label="Display format for formula {i + 1}">
              <option value={1}>decimals</option>
              <option value={2}>significant figures</option>
            </select>
          </div>
        </div>
      </div>
      <RichText bind:value={a.feedback} compact minHeight={30} placeholder="Feedback (optional)" label="Feedback for formula {i + 1}" />
    </div>
  {/each}
  <div>
    <button class="btn btn-sm" onclick={() => q.answers.push(newAnswer({ text: '', fraction: 0, tolerance: 0.01, tolerancetype: 1, correctanswerformat: 1, correctanswerlength: 2 }))}>
      <Plus size={15} /> Add formula
    </button>
  </div>
</Section>

<Section
  title="Wildcards"
  required
  subtitle="Each {'{name}'} in the question text or the formulas gets a random value from its range. Moodle gives every attempt one of the value sets below."
  info="Write a wildcard in curly brackets, starting with a letter, e.g. {'{mass}'} or {'{v1}'}. You can also put a formula in the text as {'{={a} * 2}'} to show a calculated value."
>
  {#if q.datasets.length}
    <div class="ds-table" role="table">
      <div class="ds-row head" role="row">
        <span role="columnheader">Wildcard</span>
        <span role="columnheader">From</span>
        <span role="columnheader">To</span>
        <span role="columnheader">Decimals</span>
        <span role="columnheader">Distribution <Info text="Uniform spreads values evenly over the range. Log-uniform favours smaller values, which suits ranges like 1 to 10000." label="About distribution" /></span>
      </div>
      {#each q.datasets as ds (ds.id)}
        <div class="ds-row" role="row">
          <span class="ds-name mono">{'{' + ds.name + '}'}</span>
          <input class="input input-sm mono" type="number" step="any" bind:value={ds.min} onchange={() => regenerate(ds)} aria-label="Smallest value of {ds.name}" />
          <input class="input input-sm mono" type="number" step="any" bind:value={ds.max} onchange={() => regenerate(ds)} aria-label="Largest value of {ds.name}" />
          <input class="input input-sm mono" type="number" min="0" max="10" step="1" bind:value={ds.decimals} onchange={() => regenerate(ds)} aria-label="Decimals of {ds.name}" />
          <select class="select select-sm" bind:value={ds.distribution} onchange={() => regenerate(ds)} aria-label="Distribution of {ds.name}">
            <option value="uniform">Uniform</option>
            <option value="loguniform">Log-uniform</option>
          </select>
        </div>
      {/each}
    </div>

    <div class="sets-bar">
      <div class="field inline">
        <FieldLabel for="itemcount-{q.id}" text="Value sets" info="How many different sets of values Moodle can choose from (1 to 100)." />
        <input id="itemcount-{q.id}" class="input input-sm count" type="number" min="1" max={MAX_ITEMS} value={q.itemcount} onchange={(e) => setCount(e.currentTarget.value)} />
      </div>
      <button class="btn btn-sm" onclick={regenerateAll}><Dices size={15} /> New values</button>
    </div>

    <div class="sets">
      <table>
        <thead>
          <tr>
            <th>Set</th>
            {#each q.datasets as ds (ds.id)}<th class="mono">{'{' + ds.name + '}'}</th>{/each}
            <th>Answer</th>
          </tr>
        </thead>
        <tbody>
          {#each Array.from({ length: q.itemcount }, (_, n) => n) as n}
            {@const r = correct && String(correct.text).trim() ? tryEvaluate(correct.text, itemValues(q, n)) : null}
            <tr>
              <td class="muted">{n + 1}</td>
              {#each q.datasets as ds (ds.id)}<td class="mono">{ds.items[n] ?? ''}</td>{/each}
              <td class="mono" class:bad={r?.error} title={r?.error ?? ''}>{r ? (r.error ? 'Error' : formatAnswer(r.value, correct.correctanswerformat, correct.correctanswerlength)) : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="empty">Write a wildcard such as {'{a}'} in the question text or a formula to give it random values.</p>
  {/if}
</Section>

<UnitsSection bind:q />

<style>
  .formula {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .formula-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .remove {
    margin-top: 22px;
  }
  .result {
    font-size: 12px;
    color: var(--text-3);
  }
  .result.bad,
  .bad {
    color: var(--danger);
  }
  .formula-opts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pair .input {
    width: 100px;
  }
  .pair .select {
    width: auto;
  }
  .pm {
    color: var(--text-3);
  }
  .ds-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ds-row {
    display: grid;
    grid-template-columns: minmax(70px, 0.8fr) 1fr 1fr 90px 1.1fr;
    gap: 8px;
    align-items: center;
  }
  .ds-row.head {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ds-row.head > span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ds-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sets-bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .inline {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .count {
    width: 80px;
  }
  .sets {
    max-height: 260px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .sets table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .sets th,
  .sets td {
    padding: 4px 10px;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
  }
  .sets th:first-child,
  .sets td:first-child {
    text-align: left;
  }
  .sets th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    font-weight: 600;
    color: var(--text-2);
  }
  .sets tr:last-child td {
    border-bottom: 0;
  }
  .muted {
    color: var(--text-3);
  }
  .empty {
    margin: 0;
    padding: 14px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--text-3);
    font-size: 13px;
    text-align: center;
  }
  @media (max-width: 760px) {
    .ds-row {
      grid-template-columns: 60px 1fr 1fr;
    }
    .ds-row.head {
      display: none;
    }
  }
</style>
