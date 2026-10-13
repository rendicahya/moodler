<script>
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import RichText from '../RichText.svelte';
  import { app, closeModal, ask } from '../../lib/store.svelte.js';
  import { HELP } from '../../lib/help.js';
  import { PENALTIES } from '../../lib/model.js';

  // Keep the category path in sync with the quiz name until the user edits it directly.
  let linked = $state(app.quiz.category === `$course$/top/${app.quiz.name}`);

  function setName(v) {
    app.quiz.name = v;
    if (linked) app.quiz.category = `$course$/top/${v}`;
  }

  async function applyDefaults() {
    const ok = await ask({
      title: 'Apply defaults to all questions?',
      message: `Every question (except descriptions and Cloze) will get a default mark of ${app.quiz.defaults.defaultgrade} and a penalty of ${Math.round(app.quiz.defaults.penalty * 10000) / 100}%.`,
      confirmLabel: 'Apply to all',
    });
    if (!ok) return;
    for (const q of app.quiz.questions) {
      if (q.type === 'description') continue;
      if (q.type !== 'cloze') q.defaultgrade = app.quiz.defaults.defaultgrade;
      if (q.type !== 'essay') q.penalty = app.quiz.defaults.penalty;
    }
  }
</script>

<Modal title="Quiz settings" subtitle="Properties that apply to the whole question set." width="640px" onclose={closeModal}>
  <p class="legend"><span class="req">*</span> Required field</p>
  <div class="field">
    <FieldLabel
      for="quiz-name"
      text="Quiz name"
      optional
      info="Used for the export file name and, by default, the category name. Moodle doesn’t import it as a quiz: you create the quiz in Moodle and add these questions to it."
    />
    <input id="quiz-name" class="input" value={app.quiz.name} oninput={(e) => setName(e.currentTarget.value)} />
  </div>
  <div class="field">
    <FieldLabel for="quiz-cat" text="Question bank category" optional info={HELP.category} />
    <input id="quiz-cat" class="input mono" bind:value={app.quiz.category} oninput={() => (linked = false)} placeholder="$course$/top/My quiz" />
    <span class="hint">Path of the category questions are imported into. Use <code>/</code> for sub-categories, e.g. <code>$course$/top/Unit 1/Week 2</code>.</span>
  </div>
  <Switch bind:checked={app.quiz.includeCategory} label="Include category in exports" description="Moodle creates the category if it doesn't exist (requires “Get category from file” on import)." />
  <div class="field">
    <FieldLabel text="Category description" optional info="Description stored with the category in the question bank. Only included in Moodle XML exports." />
    <RichText bind:value={app.quiz.info} compact minHeight={50} placeholder="Moodle XML only" label="Category description" />
  </div>

  <div class="divider"></div>
  <h3>Defaults for new questions</h3>
  <div class="grid-2">
    <div class="field">
      <FieldLabel for="def-grade" text="Default mark" required info={HELP.defaultgrade} />
      <input id="def-grade" class="input input-sm" type="number" min="0" step="any" required bind:value={app.quiz.defaults.defaultgrade} />
    </div>
    <div class="field">
      <FieldLabel for="def-penalty" text="Penalty per wrong try" info={HELP.penalty} />
      <select id="def-penalty" class="select select-sm" bind:value={app.quiz.defaults.penalty}>
        {#each PENALTIES as p}<option value={p.value}>{p.label}</option>{/each}
      </select>
    </div>
  </div>
  <div>
    <button class="btn btn-sm" disabled={!app.quiz.questions.length} onclick={applyDefaults}>Apply to all existing questions</button>
  </div>

  {#snippet footer()}
    <button class="btn btn-primary" onclick={closeModal}>Done</button>
  {/snippet}
</Modal>

<style>
  .divider {
    height: 1px;
    background: var(--border);
  }
  h3 {
    font-size: 14px;
  }
</style>
