<script>
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import TagInput from '../ui/TagInput.svelte';
  import { PENALTIES, TYPE_MAP } from '../../lib/model.js';
  import { HELP } from '../../lib/help.js';
  import { app, checkedQuestions, closeModal, notify } from '../../lib/store.svelte.js';

  const questions = checkedQuestions();
  const n = questions.length;

  // Every field starts as "leave unchanged"; only the ones the user touches are applied.
  let mark = $state('');
  let penalty = $state('keep');
  let addTags = $state([]);
  let removeTags = $state([]);
  let categoryMode = $state('keep');
  let category = $state('');
  let visibility = $state('keep');
  let review = $state('keep');

  const existingTags = [...new Set(questions.flatMap((q) => q.tags))].sort((a, b) => a.localeCompare(b));
  const markable = questions.filter((q) => !['description', 'cloze'].includes(q.type)).length;
  const penaltyable = questions.filter((q) => !['description', 'essay'].includes(q.type)).length;
  const types = [...new Set(questions.map((q) => TYPE_MAP[q.type].label))].join(', ');

  const markValid = $derived(mark === '' || (Number.isFinite(Number(mark)) && Number(mark) >= 0));
  const changes = $derived(
    (mark !== '' ? 1 : 0) +
      (penalty !== 'keep' ? 1 : 0) +
      (addTags.length || removeTags.length ? 1 : 0) +
      (categoryMode !== 'keep' ? 1 : 0) +
      (visibility !== 'keep' ? 1 : 0) +
      (review !== 'keep' ? 1 : 0)
  );

  function toggleRemove(t) {
    removeTags = removeTags.includes(t) ? removeTags.filter((x) => x !== t) : [...removeTags, t];
  }

  function apply() {
    const ids = new Set(app.checked);
    for (const q of app.quiz.questions) {
      if (!ids.has(q.id)) continue;
      if (mark !== '' && !['description', 'cloze'].includes(q.type)) q.defaultgrade = Number(mark);
      if (penalty !== 'keep' && !['description', 'essay'].includes(q.type)) q.penalty = Number(penalty);
      if (removeTags.length) q.tags = q.tags.filter((t) => !removeTags.includes(t));
      for (const t of addTags) if (!q.tags.includes(t)) q.tags.push(t);
      if (categoryMode === 'set') q.category = category.trim();
      else if (categoryMode === 'clear') q.category = '';
      if (visibility !== 'keep') q.hidden = visibility === 'hidden';
      if (review === 'done') delete q.unreviewed;
      else if (review === 'todo') q.unreviewed = true;
    }
    closeModal();
    notify(`Updated ${n} question${n === 1 ? '' : 's'}. Undo with Ctrl+Z.`, 'success');
  }
</script>

<Modal title="Edit {n} question{n === 1 ? '' : 's'}" subtitle="Fields you leave unchanged keep each question's own value. Types: {types}." width="600px" onclose={closeModal}>
  <div class="grid-2">
    <div class="field">
      <FieldLabel for="bulk-mark" text="Default mark" optional info={HELP.defaultgrade} />
      <input id="bulk-mark" class="input input-sm" class:invalid={!markValid} type="number" min="0" step="any" placeholder="Unchanged" value={mark} oninput={(e) => (mark = e.currentTarget.value.trim())} />
      {#if markable < n}<span class="hint">Not applied to {n - markable} description or Cloze question{n - markable === 1 ? '' : 's'}.</span>{/if}
    </div>
    <div class="field">
      <FieldLabel for="bulk-penalty" text="Penalty per wrong try" optional info={HELP.penalty} />
      <select id="bulk-penalty" class="select select-sm" bind:value={penalty}>
        <option value="keep">Unchanged</option>
        {#each PENALTIES as p}<option value={p.value}>{p.label}</option>{/each}
      </select>
      {#if penaltyable < n}<span class="hint">Not applied to {n - penaltyable} essay or description question{n - penaltyable === 1 ? '' : 's'}.</span>{/if}
    </div>
  </div>

  <div class="field">
    <FieldLabel for="bulk-tags" text="Add tags" optional info="Tags are added to every selected question. Moodle uses tags to filter the question bank." />
    <TagInput id="bulk-tags" bind:tags={addTags} />
  </div>

  {#if existingTags.length}
    <div class="field">
      <FieldLabel text="Remove tags" optional info="Click a tag to remove it from every selected question that has it." />
      <div class="chips">
        {#each existingTags as t}
          <button class="chip" class:on={removeTags.includes(t)} aria-pressed={removeTags.includes(t)} onclick={() => toggleRemove(t)}>{t}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="field">
    <FieldLabel text="Category override" optional info={HELP.category} />
    <Segmented
      size="sm"
      label="Category override"
      bind:value={categoryMode}
      options={[
        { value: 'keep', label: 'Unchanged' },
        { value: 'set', label: 'Set to…' },
        { value: 'clear', label: 'Use quiz category' },
      ]}
    />
    {#if categoryMode === 'set'}
      <input class="input input-sm mono" bind:value={category} placeholder={app.quiz.category || '$course$/top/…'} aria-label="Category path" data-autofocus />
    {/if}
  </div>

  <div class="field">
    <FieldLabel text="Visibility" optional info="Hidden questions stay in the question bank but can’t be added to new quizzes." />
    <Segmented
      size="sm"
      label="Visibility"
      bind:value={visibility}
      options={[
        { value: 'keep', label: 'Unchanged' },
        { value: 'shown', label: 'Shown in bank' },
        { value: 'hidden', label: 'Hidden' },
      ]}
    />
  </div>

  <div class="field">
    <FieldLabel text="Review" optional info="Questions to review are flagged in the list until you have checked them. Only used in Moodler, never exported." />
    <Segmented
      size="sm"
      label="Review"
      bind:value={review}
      options={[
        { value: 'keep', label: 'Unchanged' },
        { value: 'done', label: 'Reviewed' },
        { value: 'todo', label: 'To review' },
      ]}
    />
  </div>

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Cancel</button>
    <button class="btn btn-primary" disabled={!changes || !markValid || (categoryMode === 'set' && !category.trim())} onclick={apply}>
      Apply to {n} question{n === 1 ? '' : 's'}
    </button>
  {/snippet}
</Modal>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 12.5px;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--border-strong);
  }
  .chip.on {
    border-color: var(--danger);
    background: var(--danger-soft);
    color: var(--danger);
    text-decoration: line-through;
  }
  .invalid {
    border-color: var(--danger);
  }
</style>
