<script>
  import { ChevronUp, ChevronDown, Copy, Trash, Pencil, Eye, TriangleAlert, Plus, X, PanelRightOpen, PanelRightClose } from '@lucide/svelte';
  import Section from './ui/Section.svelte';
  import Switch from './ui/Switch.svelte';
  import Segmented from './ui/Segmented.svelte';
  import TagInput from './ui/TagInput.svelte';
  import FieldLabel from './ui/FieldLabel.svelte';
  import Info from './ui/Info.svelte';
  import RichText from './RichText.svelte';
  import Preview from './Preview.svelte';
  import MultiChoiceEditor from './editors/MultiChoiceEditor.svelte';
  import TrueFalseEditor from './editors/TrueFalseEditor.svelte';
  import ShortAnswerEditor from './editors/ShortAnswerEditor.svelte';
  import EssayEditor from './editors/EssayEditor.svelte';
  import MatchingEditor from './editors/MatchingEditor.svelte';
  import ClozeEditor from './editors/ClozeEditor.svelte';
  import GapEditor from './editors/GapEditor.svelte';
  import OrderingEditor from './editors/OrderingEditor.svelte';
  import { app, duplicateQuestion, deleteQuestion, moveQuestion, togglePreview, saveLayout } from '../lib/store.svelte.js';
  import { TYPE_MAP, TEXT_FORMATS, validateQuestion, uid } from '../lib/model.js';
  import { TYPE_ICONS } from '../lib/icons.js';
  import { HELP } from '../lib/help.js';

  let { q = $bindable(), index } = $props();

  const meta = $derived(TYPE_MAP[q.type]);
  const Icon = $derived(TYPE_ICONS[q.type]);
  const issues = $derived(validateQuestion(q));
  const textId = $derived(`qtext-${q.id}`);
  const hasCombined = $derived(['multichoice', 'matching', 'gapselect', 'ddwtos', 'ordering'].includes(q.type));
  const hasHints = $derived(!['essay', 'description'].includes(q.type));
  const hasPenalty = $derived(!['essay', 'description'].includes(q.type));
  const hasMark = $derived(!['description', 'cloze'].includes(q.type));

  const PENALTIES = [
    { value: 1, label: '100%' },
    { value: 0.5, label: '50%' },
    { value: 0.3333333, label: '33.33%' },
    { value: 0.25, label: '25%' },
    { value: 0.2, label: '20%' },
    { value: 0.1, label: '10%' },
    { value: 0, label: '0%' },
  ];
  const penaltyOptions = $derived(PENALTIES.some((p) => Math.abs(p.value - q.penalty) < 0.0001) ? PENALTIES : [...PENALTIES, { value: q.penalty, label: `${Math.round(q.penalty * 10000) / 100}%` }]);
  const penaltyValue = $derived(penaltyOptions.find((p) => Math.abs(p.value - q.penalty) < 0.0001)?.value);

  // Below this width the editor and preview don't fit side by side, so they become tabs.
  const SPLIT_MIN_WIDTH = 960;
  let width = $state(0);
  let body = $state();
  $effect(() => {
    if (width) app.wide = width >= SPLIT_MIN_WIDTH;
  });
  const split = $derived(app.wide && app.showPreview);
  const showEditor = $derived(app.wide || app.tab === 'edit');
  const showPreview = $derived(app.wide ? app.showPreview : app.tab === 'preview');

  let dragging = $state(false);
  function startResize(e) {
    e.preventDefault();
    dragging = true;
    const rect = body.getBoundingClientRect();
    const move = (ev) => {
      app.splitRatio = Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width));
    };
    const up = () => {
      dragging = false;
      saveLayout();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function resizeKey(e) {
    const step = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
    if (!step) return;
    e.preventDefault();
    app.splitRatio = Math.min(0.75, Math.max(0.25, app.splitRatio + step));
    saveLayout();
  }
</script>

<div class="editor" bind:clientWidth={width}>
  <div class="toolbar">
    <div class="ident">
      <span class="icon"><Icon size={18} /></span>
      <div>
        <div class="type">{meta.label}</div>
        <div class="pos">Question {index + 1} of {app.quiz.questions.length}</div>
      </div>
    </div>
    {#if !app.wide}
      <Segmented
        bind:value={app.tab}
        size="sm"
        label="View"
        options={[
          { value: 'edit', label: 'Edit', icon: Pencil },
          { value: 'preview', label: 'Preview', icon: Eye },
        ]}
      />
    {/if}
    <div class="acts">
      {#if app.wide}
        <button
          class="btn btn-ghost btn-sm"
          class:on={app.showPreview}
          title="{app.showPreview ? 'Hide' : 'Show'} live preview (Alt+P)"
          aria-pressed={app.showPreview}
          onclick={togglePreview}
          >{#if app.showPreview}<PanelRightClose size={16} />{:else}<PanelRightOpen size={16} />{/if} Preview</button
        >
        <span class="sep"></span>
      {/if}
      <button class="btn btn-ghost btn-icon btn-sm" title="Move up (Alt+↑ in list)" aria-label="Move up" disabled={index === 0} onclick={() => moveQuestion(index, index - 1)}
        ><ChevronUp size={16} /></button
      >
      <button
        class="btn btn-ghost btn-icon btn-sm"
        title="Move down (Alt+↓ in list)"
        aria-label="Move down"
        disabled={index === app.quiz.questions.length - 1}
        onclick={() => moveQuestion(index, index + 1)}><ChevronDown size={16} /></button
      >
      <button class="btn btn-ghost btn-icon btn-sm" title="Duplicate" aria-label="Duplicate" onclick={() => duplicateQuestion(q.id)}><Copy size={15} /></button>
      <button class="btn btn-ghost btn-icon btn-sm danger" title="Delete" aria-label="Delete" onclick={() => deleteQuestion(q.id)}><Trash size={15} /></button>
    </div>
  </div>

  <div class="body" class:split class:dragging bind:this={body} style:--ratio={app.splitRatio}>
    {#if showEditor}<div class="pane edit-pane"><div class="content">
      {#if issues.length}
        <div class="issues" role="status">
          <TriangleAlert size={17} />
          <div>
            <strong>This question needs attention</strong>
            <ul>
              {#each issues as issue}<li>{issue}</li>{/each}
            </ul>
          </div>
        </div>
      {/if}

      <p class="legend"><span class="req">*</span> Required field. Hover or focus <Info text="Like this one. These explain Moodle terms that may be unfamiliar." label="Example tooltip" /> for an explanation.</p>

      <Section title="General">
        <div class="field">
          <FieldLabel
            for="qname-{q.id}"
            text="Question name"
            optional
            info="Only shown to teachers in the question bank, never to students. If left empty, the start of the question text is used."
          />
          <input id="qname-{q.id}" class="input" bind:value={q.name} placeholder="Defaults to the start of the question text" />
        </div>
        <div class="field">
          <div class="label-row">
            <FieldLabel
              for={textId}
              text={q.type === 'description' ? 'Text' : 'Question text'}
              required
              info={q.type === 'cloze'
                ? 'The whole question, including the gaps. Each gap is written in Cloze syntax inside curly braces — use “Insert gap” below to build them.'
                : q.type === 'gapselect' || q.type === 'ddwtos'
                  ? 'Write [[1]], [[2]], … where each choice should go. The number refers to the choice’s position in the list below.'
                  : 'What the student reads. You can format text, add images, links and equations.'}
            />
            <select class="select select-sm fmt" bind:value={q.questiontextformat} aria-label="Text format">
              {#each TEXT_FORMATS as f}<option value={f.value}>{f.label}</option>{/each}
            </select>
          </div>
          {#if q.questiontextformat === 'html'}
            <RichText
              bind:value={q.questiontext}
              id={textId}
              minHeight={q.type === 'cloze' || q.type === 'description' ? 180 : 110}
              placeholder={q.type === 'cloze'
                ? 'Write the text and insert gaps like {1:SHORTANSWER:=answer}'
                : q.type === 'gapselect' || q.type === 'ddwtos'
                  ? 'Write the text with placeholders like [[1]] and [[2]]'
                  : 'Enter the question text'}
              label="Question text"
            />
          {:else}
            <textarea id={textId} class="textarea" rows="6" bind:value={q.questiontext}></textarea>
          {/if}
        </div>
        <div class="meta">
          {#if hasMark}
            <div class="field">
              <FieldLabel
                for="grade-{q.id}"
                text="Default mark"
                required
                info={HELP.defaultgrade}
              />
              <input id="grade-{q.id}" class="input input-sm" type="number" min="0" step="any" required bind:value={q.defaultgrade} />
            </div>
          {/if}
          {#if hasPenalty}
            <div class="field">
              <FieldLabel
                for="penalty-{q.id}"
                text="Penalty per wrong try"
                info={HELP.penalty}
              />
              <select id="penalty-{q.id}" class="select select-sm" value={penaltyValue} onchange={(e) => (q.penalty = Number(e.currentTarget.value))}>
                {#each penaltyOptions as p}<option value={p.value}>{p.label}</option>{/each}
              </select>
            </div>
          {/if}
          <div class="field">
            <FieldLabel
              for="idn-{q.id}"
              text="ID number"
              optional
              info="Your own identifier for the question, e.g. CH2-Q05. It must be unique within its category. Students never see it."
            />
            <input id="idn-{q.id}" class="input input-sm" bind:value={q.idnumber} />
          </div>
          <div class="field">
            <FieldLabel text="Visibility" info="Hidden questions stay in the question bank but can’t be added to new quizzes." />
            <Switch bind:checked={() => !q.hidden, (v) => (q.hidden = !v)} label="Shown in bank" />
          </div>
        </div>
      </Section>

      {#if q.type === 'multichoice'}
        <MultiChoiceEditor bind:q />
      {:else if q.type === 'truefalse'}
        <TrueFalseEditor bind:q />
      {:else if q.type === 'shortanswer'}
        <ShortAnswerEditor bind:q />
      {:else if q.type === 'numerical'}
        <ShortAnswerEditor bind:q numerical />
      {:else if q.type === 'essay'}
        <EssayEditor bind:q />
      {:else if q.type === 'matching'}
        <MatchingEditor bind:q />
      {:else if q.type === 'cloze'}
        <ClozeEditor bind:q {textId} />
      {:else if q.type === 'gapselect' || q.type === 'ddwtos'}
        <GapEditor bind:q {textId} />
      {:else if q.type === 'ordering'}
        <OrderingEditor bind:q />
      {/if}

      {#if hasCombined}
        <Section
          title="Combined feedback"
          subtitle="Shown after the attempt depending on the overall result."
          optional
          info="One message per outcome — fully correct, partially correct or incorrect — in addition to any per-answer feedback."
          collapsible
          open={false}
        >
          <div class="field">
            <span class="label">For any correct response</span>
            <RichText bind:value={q.correctfeedback} compact minHeight={40} label="Feedback for correct response" />
          </div>
          <div class="field">
            <span class="label">For any partially correct response</span>
            <RichText bind:value={q.partiallycorrectfeedback} compact minHeight={40} label="Feedback for partially correct response" />
          </div>
          <div class="field">
            <span class="label">For any incorrect response</span>
            <RichText bind:value={q.incorrectfeedback} compact minHeight={40} label="Feedback for incorrect response" />
          </div>
          <Switch bind:checked={q.shownumcorrect} label="Show the number of correct responses" />
        </Section>
      {/if}

      <Section title="General feedback" subtitle="Shown to every student after the attempt, regardless of their answer." optional collapsible open={!!q.generalfeedback}>
        <RichText bind:value={q.generalfeedback} minHeight={70} placeholder="Explain the correct answer…" label="General feedback" />
      </Section>

      {#if hasHints}
        <Section
          title="Hints"
          subtitle="Used with the “Interactive with multiple tries” behaviour."
          optional
          info="After each wrong try the next hint is shown and the student can try again. The number of hints sets the number of extra tries; with none, there is only one try."
          collapsible
          open={q.hints.length > 0}
        >
          {#each q.hints as h, i (h.id)}
            <div class="hint-row">
              <span class="label">Hint {i + 1}</span>
              <div class="hint-edit">
                <RichText bind:value={h.text} compact minHeight={40} label="Hint {i + 1}" />
                <button class="btn btn-ghost btn-icon btn-sm danger" aria-label="Remove hint" onclick={() => q.hints.splice(i, 1)}><X size={15} /></button>
              </div>
            </div>
          {/each}
          <div>
            <button class="btn btn-sm" onclick={() => q.hints.push({ id: uid(), text: '' })}><Plus size={15} /> Add hint</button>
          </div>
        </Section>
      {/if}

      <Section title="Tags & category" optional collapsible open={q.tags.length > 0 || !!q.category}>
        <div class="field">
          <FieldLabel for="tags-{q.id}" text="Tags" optional info="Keywords for filtering and finding questions in the Moodle question bank." />
          <TagInput bind:tags={q.tags} id="tags-{q.id}" />
        </div>
        <div class="field">
          <FieldLabel
            for="cat-{q.id}"
            text="Category override"
            optional
            info="The question bank category is the folder Moodle imports the question into. Use a path like $course$/top/Chapter 2 to put this question somewhere other than the rest of the quiz."
          />
          <input id="cat-{q.id}" class="input input-sm mono" bind:value={q.category} placeholder={app.quiz.category || '$course$/top/…'} />
          <span class="hint">Leave empty to use the quiz category. Only used by Moodle XML and GIFT export.</span>
        </div>
      </Section>
    </div></div>{/if}

    {#if split}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview"
        aria-valuenow={Math.round(app.splitRatio * 100)}
        tabindex="0"
        onpointerdown={startResize}
        onkeydown={resizeKey}
        ondblclick={() => ((app.splitRatio = 0.55), saveLayout())}
        title="Drag to resize, double-click to reset"
      ></div>
    {/if}

    {#if showPreview}
      <div class="pane preview-pane" class:side={split}>
        <div class="content">
          {#if split}<div class="pane-title"><span class="live"></span> Live preview</div>{/if}
          <Preview {q} {index} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    flex: none;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 24px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .ident {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent-text);
    flex: none;
  }
  .type {
    font-weight: 600;
    white-space: nowrap;
  }
  .pos {
    font-size: 12px;
    color: var(--text-3);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .acts .on {
    color: var(--accent-text);
    background: var(--accent-soft);
  }
  .sep {
    width: 1px;
    height: 20px;
    margin: 0 6px;
    background: var(--border);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .body.dragging {
    cursor: col-resize;
    user-select: none;
  }
  .pane {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
  .split .edit-pane {
    flex: 0 0 calc(var(--ratio) * 100%);
  }
  .preview-pane.side {
    background: var(--surface-2);
  }
  .preview-pane.side .content {
    max-width: 760px;
  }
  .divider {
    flex: none;
    width: 7px;
    margin: 0 -3px;
    z-index: 2;
    cursor: col-resize;
    position: relative;
    outline: none;
  }
  .divider::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    background: var(--border);
    transition: background 0.12s;
  }
  .divider:hover::after,
  .divider:focus-visible::after,
  .dragging .divider::after {
    inset: 0 2px;
    background: var(--accent);
  }
  .pane-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .live {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-soft);
  }
  .content {
    width: 100%;
    max-width: 920px;
    margin: 0 auto;
    padding: 20px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  /* Wraps by available width, so it also fits the narrower editor pane in split view. */
  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
    gap: 14px;
  }
  .content > .legend {
    margin: -4px 0 -6px;
  }
  .issues {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-lg);
    background: var(--warning-soft);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
    font-size: 13px;
  }
  .issues :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .issues ul {
    margin: 2px 0 0;
    padding-left: 18px;
    color: var(--text-2);
  }
  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .fmt {
    width: auto;
    height: 26px;
    font-size: 12px;
    padding-left: 8px;
  }
  .hint-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hint-edit {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .hint-edit > :global(.rte) {
    flex: 1;
  }
  @media (max-width: 700px) {
    .toolbar {
      padding: 8px 12px;
      flex-wrap: wrap;
    }
    .content {
      padding: 16px 12px 60px;
    }
    .pos {
      display: none;
    }
  }
</style>
