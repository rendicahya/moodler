<script>
  import { Plus, Trash } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import FractionSelect from '../ui/FractionSelect.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { CLOZE_TYPES, buildCloze, isNumericalCloze, isChoiceCloze } from '../../lib/formats/cloze.js';
  import { newAnswer } from '../../lib/model.js';

  let { gap = null, onsave, onclose } = $props();

  // svelte-ignore state_referenced_locally
  const initial = gap
    ? JSON.parse(JSON.stringify(gap))
    : { weight: 1, type: 'SHORTANSWER', answers: [newAnswer({ fraction: 100, tolerance: 0 }), newAnswer({ tolerance: 0 })] };
  let draft = $state(initial);

  const numeric = $derived(isNumericalCloze(draft.type));
  const choice = $derived(isChoiceCloze(draft.type));
  const syntax = $derived(buildCloze(draft));
  const hasCorrect = $derived(draft.answers.some((a) => Number(a.fraction) === 100 || (/^MULTIRESPONSE/.test(draft.type) && a.fraction > 0)));
</script>

<Modal title={gap ? 'Edit embedded answer' : 'Insert embedded answer'} subtitle="Builds Cloze syntax for one gap in the question text." width="720px" {onclose}>
  <div class="grid-3">
    <div class="field" style="grid-column: span 2">
      <FieldLabel
        for="gap-type"
        text="Type"
        info="Short answer: a text box (“case sensitive” versions treat capitals as different). Numerical: a number box with tolerance. Multiple choice: a drop-down, vertical or horizontal radio buttons. Multiple response: checkboxes. “Shuffled” versions show the options in random order."
      />
      <select id="gap-type" class="select" bind:value={draft.type}>
        {#each CLOZE_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
      </select>
    </div>
    <div class="field">
      <FieldLabel
        for="gap-weight"
        text="Weight (marks)"
        required
        info="How many marks this gap is worth. The question’s total mark is the sum of all gap weights."
      />
      <input id="gap-weight" class="input" type="number" min="0" step="1" bind:value={draft.weight} />
    </div>
  </div>

  <div class="field">
    <FieldLabel
      text={choice ? 'Choices' : 'Accepted answers'}
      required
      info={numeric
        ? 'Each row: a number, the allowed error (±), the grade it earns, and optional feedback. One answer should be worth 100%.'
        : choice
          ? 'Each row: an option, the grade for choosing it, and optional feedback. One option should be worth 100%.'
          : 'Each row: an accepted answer (* is a wildcard), the grade it earns, and optional feedback. One answer should be worth 100%.'}
    />
    <div class="answers">
      {#each draft.answers as a, i (a.id)}
        <div class="row" class:numeric>
          <input class="input input-sm" bind:value={a.text} placeholder={numeric ? 'Number' : choice ? 'Choice text' : 'Answer'} aria-label="Answer {i + 1}" />
          {#if numeric}
            <input class="input input-sm" type="number" step="any" min="0" bind:value={a.tolerance} placeholder="±" aria-label="Tolerance {i + 1}" title="Tolerance (±)" />
          {/if}
          <FractionSelect bind:value={a.fraction} negative={/^MULTIRESPONSE/.test(draft.type)} />
          <input class="input input-sm" bind:value={a.feedback} placeholder="Feedback (optional)" aria-label="Feedback {i + 1}" />
          <button class="btn btn-ghost btn-icon btn-sm danger" aria-label="Remove" onclick={() => draft.answers.splice(i, 1)}><Trash size={15} /></button>
        </div>
      {/each}
    </div>
    <div>
      <button class="btn btn-sm" onclick={() => draft.answers.push(newAnswer({ tolerance: 0 }))}><Plus size={15} /> Add {choice ? 'choice' : 'answer'}</button>
    </div>
  </div>

  <div class="field">
    <span class="label">Generated syntax</span>
    <code class="syntax">{syntax}</code>
    {#if !hasCorrect}<span class="hint warn">At least one answer should be worth 100%.</span>{/if}
  </div>

  {#snippet footer()}
    <button class="btn" onclick={onclose}>Cancel</button>
    <button class="btn btn-primary" onclick={() => onsave(syntax)}>{gap ? 'Update gap' : 'Insert gap'}</button>
  {/snippet}
</Modal>

<style>
  .answers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 1.2fr 110px 1fr 30px;
    gap: 6px;
  }
  .row.numeric {
    grid-template-columns: 1fr 90px 110px 1fr 30px;
  }
  .syntax {
    display: block;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--surface-3);
    word-break: break-all;
    font-size: 12.5px;
  }
  .warn {
    color: var(--warning);
  }
</style>
