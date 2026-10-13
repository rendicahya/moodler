<script>
  import { Plus, GripVertical, Trash, CircleCheck, Circle, SquareCheck, Square } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FractionSelect from '../ui/FractionSelect.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import RichText from '../RichText.svelte';
  import { newAnswer, moveItem, round } from '../../lib/model.js';
  import { createSortable } from '../../lib/sortable.svelte.js';

  let { q = $bindable() } = $props();
  const sort = createSortable((from, to) => moveItem(q.answers, from, to));

  const NUMBERING = [
    { value: 'abc', label: 'a., b., c., …' },
    { value: 'ABCD', label: 'A., B., C., …' },
    { value: '123', label: '1., 2., 3., …' },
    { value: 'iii', label: 'i., ii., iii., …' },
    { value: 'IIII', label: 'I., II., III., …' },
    { value: 'none', label: 'No numbering' },
  ];

  const positive = $derived(round(q.answers.filter((a) => a.fraction > 0).reduce((s, a) => s + Number(a.fraction), 0), 2));

  function label(i) {
    switch (q.answernumbering) {
      case 'ABCD':
        return String.fromCharCode(65 + (i % 26));
      case '123':
        return String(i + 1);
      case 'iii':
        return roman(i + 1).toLowerCase();
      case 'IIII':
        return roman(i + 1);
      case 'none':
        return '•';
      default:
        return String.fromCharCode(97 + (i % 26));
    }
  }
  function roman(n) {
    const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of map) while (n >= v) (s += r), (n -= v);
    return s;
  }

  function markCorrect(i) {
    if (q.single) q.answers.forEach((a, j) => (a.fraction = j === i ? 100 : a.fraction === 100 ? 0 : a.fraction));
    else {
      const a = q.answers[i];
      a.fraction = a.fraction > 0 ? 0 : 100;
      // Spread credit evenly across all correct answers.
      const correct = q.answers.filter((x) => x.fraction > 0);
      const share = round(100 / correct.length, 5);
      correct.forEach((x) => (x.fraction = share));
    }
  }

  function setMode(single) {
    q.single = single;
    if (single) {
      // A single-answer question needs exactly one 100% answer and no negative grades.
      const best = q.answers.reduce((b, a, i) => (a.fraction > (q.answers[b]?.fraction ?? -Infinity) ? i : b), 0);
      q.answers.forEach((a, i) => (a.fraction = i === best ? 100 : a.fraction < 0 || a.fraction >= 100 ? 0 : a.fraction));
    }
  }
</script>

<Section title="Answer options">
  <div class="opts">
    <div class="field">
      <FieldLabel
        text="Answers allowed"
        info="One answer: students pick a single option (radio buttons). Multiple answers: students tick any number of options (checkboxes); the grades of the correct options should add up to 100%, and wrong ones can carry a negative grade to discourage guessing."
      />
      <Segmented
        options={[
          { value: 'single', label: 'One answer' },
          { value: 'multi', label: 'Multiple answers' },
        ]}
        label="Answers allowed"
        size="sm"
        bind:value={() => (q.single ? 'single' : 'multi'), (v) => setMode(v === 'single')}
      />
    </div>
    <div class="field">
      <FieldLabel for="numbering-{q.id}" text="Numbering" info="How the options are labelled for students: a., A., 1., i., I. or no label." />
      <select id="numbering-{q.id}" class="select select-sm" bind:value={q.answernumbering}>
        {#each NUMBERING as n}<option value={n.value}>{n.label}</option>{/each}
      </select>
    </div>
    <Switch
      bind:checked={q.shuffleanswers}
      label="Shuffle answers"
      info="Shows the options in a random order for each attempt. Only applies when the quiz’s own “Shuffle within questions” setting is also on."
    />
    <Switch
      bind:checked={q.showstandardinstruction}
      label="Show instruction"
      description="“Select one or more:”"
      info="Shows Moodle’s standard prompt (“Select one:” or “Select one or more:”) above the options."
    />
  </div>
</Section>

<Section
  title="Answers"
  required
  info="At least two answers are needed. Each answer’s grade is the percentage of the mark a student earns for choosing it; negative grades take marks away. Per-answer feedback is shown to students who chose that answer."
  subtitle={q.single ? 'Click the circle to mark the correct answer. Partial credit can be set per answer.' : `Positive grades add up to ${positive}% — they should total 100%.`}>
  {#snippet actions()}
    {#if !q.single}
      <span class="badge {Math.abs(positive - 100) < 0.5 ? 'success' : 'warning'}">{positive}%</span>
    {/if}
  {/snippet}
  <div class="answers">
    {#each q.answers as a, i (a.id)}
      {@const ind = sort.indicator(i)}
      {@const correct = a.fraction > 0}
      <div class="answer" class:correct class:drop-before={ind === 'before'} class:drop-after={ind === 'after'} class:dragging={sort.dragging === i} {...sort.item(i)}>
        <div class="gutter">
          <span class="drag-handle" title="Drag to reorder" {...sort.handle(i)}><GripVertical size={15} /></span>
          <span class="letter">{label(i)}</span>
          <button class="mark" class:on={correct} title={correct ? 'Correct' : 'Mark as correct'} aria-label="Toggle correct" onclick={() => markCorrect(i)}>
            {#if q.single}
              {#if a.fraction === 100}<CircleCheck size={19} />{:else}<Circle size={19} />{/if}
            {:else if correct}<SquareCheck size={19} />{:else}<Square size={19} />{/if}
          </button>
        </div>
        <div class="main">
          <RichText bind:value={a.text} compact placeholder="Answer {label(i)}" label="Answer {label(i)} text" />
          <div class="row2">
            <RichText bind:value={a.feedback} compact minHeight={32} placeholder="Feedback (optional)" label="Feedback for answer {label(i)}" />
            <FractionSelect bind:value={a.fraction} negative={!q.single} />
            <button class="btn btn-ghost btn-icon btn-sm danger" title="Remove answer" aria-label="Remove answer" onclick={() => q.answers.splice(i, 1)}><Trash size={15} /></button>
          </div>
        </div>
      </div>
    {/each}
  </div>
  <div>
    <button class="btn btn-sm" onclick={() => q.answers.push(newAnswer())}><Plus size={15} /> Add answer</button>
  </div>
</Section>

<style>
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 18px 28px;
    align-items: flex-end;
  }
  .opts .field {
    min-width: 170px;
  }
  .answers {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .answer {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .answer.correct {
    border-color: color-mix(in srgb, var(--success) 45%, transparent);
    background: var(--success-soft);
  }
  .answer.dragging {
    opacity: 0.4;
  }
  .gutter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-top: 4px;
  }
  .letter {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-2);
    min-width: 20px;
    text-align: center;
  }
  .mark {
    border: none;
    background: none;
    padding: 2px;
    border-radius: 50%;
    color: var(--text-3);
    cursor: pointer;
    display: inline-flex;
  }
  .mark:hover {
    color: var(--success);
  }
  .mark.on {
    color: var(--success);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row2 {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .row2 > :global(.rte) {
    flex: 1;
  }
</style>
