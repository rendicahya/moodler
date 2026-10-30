<script>
  import { Copy, Check, Replace, ListPlus, CircleAlert, CircleCheck, ImageIcon } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { TASK_MAP, tasksFor, buildImprovePrompt, readReply } from '../../lib/improve.js';
  import { TYPE_MAP, questionTitle } from '../../lib/model.js';
  import { app, closeModal, notify, applyAiQuestions } from '../../lib/store.svelte.js';

  const PREFS_KEY = 'mqe.aiImprove';
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }
  const prefs = loadPrefs();
  const LANGUAGES = ['English', 'Indonesian', 'Arabic', 'Chinese', 'Dutch', 'French', 'German', 'Japanese', 'Korean', 'Malay', 'Portuguese', 'Spanish'];

  // The question is fixed when the dialog opens, so editing elsewhere can't change what the reply replaces.
  const q = $state.snapshot(app.quiz.questions.find((x) => x.id === app.modalProps.id));
  const tasks = tasksFor(q.type);

  let task = $state(tasks.some((t) => t.id === prefs.task) ? prefs.task : 'improve');
  let language = $state(prefs.language || 'English');
  let count = $state(prefs.count || 3);
  let extra = $state('');
  let reply = $state('');
  let copied = $state(false);

  $effect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ task, language, count }));
    } catch {
      /* ignore */
    }
  });

  const current = $derived(TASK_MAP[task]);
  const ready = $derived(task !== 'custom' || !!extra.trim());
  const built = $derived(buildImprovePrompt({ q, task, language, count, extra }));
  const imageCount = $derived(Object.keys(built.images).length);

  const parsed = $derived.by(() => {
    if (!reply.trim()) return null;
    try {
      return readReply(reply, built.images);
    } catch (e) {
      return { error: e.message };
    }
  });
  const found = $derived(parsed?.questions ?? []);

  function setCount(value) {
    count = Math.max(1, Math.min(20, Math.round(Number(value) || 1)));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(built.prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
      notify('Prompt copied. Paste it into your AI chatbot, then paste its reply below.', 'success', 5000);
    } catch {
      notify('Could not copy. Select the prompt and copy it yourself (Ctrl+C).', 'error');
    }
  }

  function apply(replace) {
    const n = applyAiQuestions(q.id, found, replace);
    if (!n) return;
    closeModal();
    if (replace) notify(n === 1 ? 'Question replaced. Undo with Ctrl+Z.' : `Question replaced by ${n} questions. Undo with Ctrl+Z.`, 'success');
    else notify(`Added ${n} question${n === 1 ? '' : 's'} after it, marked as to review.`, 'success');
  }

  const typeLabel = (type) => TYPE_MAP[type]?.label ?? type;
</script>

<Modal
  title="Improve with AI"
  subtitle="Copy the prompt into ChatGPT, Claude, Gemini or another AI chatbot. It sends this question as Moodle XML, so you can paste the reply back here."
  width="820px"
  onclose={closeModal}
>
  <div class="target">
    <span class="chip">{typeLabel(q.type)}</span>
    <span class="target-title">{questionTitle(q)}</span>
  </div>

  <div class="field">
    <FieldLabel text="What should the AI do?" />
    <div class="tasks" role="radiogroup" aria-label="Task">
      {#each tasks as t (t.id)}
        <label class="task" class:on={task === t.id}>
          <input type="radio" name="ai-task" value={t.id} bind:group={task} />
          <span class="task-label">{t.label}</span>
          <span class="task-desc">{t.description}</span>
        </label>
      {/each}
    </div>
  </div>

  {#if task === 'translate'}
    <div class="field narrow">
      <FieldLabel for="aiq-lang" text="Into" />
      <input id="aiq-lang" class="input" bind:value={language} list="aiq-langs" />
      <datalist id="aiq-langs">{#each LANGUAGES as l}<option value={l}></option>{/each}</datalist>
    </div>
  {:else if task === 'variants'}
    <div class="field narrow">
      <FieldLabel for="aiq-count" text="How many" />
      <input id="aiq-count" class="input" type="number" min="1" max="20" value={count} oninput={(e) => setCount(e.currentTarget.value)} />
    </div>
  {/if}

  <div class="field">
    <FieldLabel for="aiq-extra" text={task === 'custom' ? 'Instructions' : 'Other instructions'} required={task === 'custom'} optional={task !== 'custom'} />
    <textarea
      id="aiq-extra"
      class="textarea"
      rows="2"
      bind:value={extra}
      placeholder={task === 'custom' ? 'e.g. Turn it into a question about a real-world situation.' : 'e.g. Use examples from Indonesia.'}
    ></textarea>
  </div>

  <div class="field">
    <FieldLabel for="aiq-prompt" text="1. Copy the prompt" />
    {#if ready}
      <textarea id="aiq-prompt" class="textarea mono prompt" rows="7" readonly value={built.prompt} onfocus={(e) => e.currentTarget.select()}></textarea>
      {#if imageCount}
        <p class="note"><ImageIcon size={15} /> <span>The {imageCount === 1 ? 'image stays' : `${imageCount} images stay`} in Moodler: the prompt only names {imageCount === 1 ? 'it' : 'them'}, and {imageCount === 1 ? 'it is' : 'they are'} put back when you paste the reply.</span></p>
      {/if}
      <div>
        <button class="btn btn-sm" onclick={copy}>{#if copied}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy prompt{/if}</button>
      </div>
    {:else}
      <p class="empty">Describe the change you want to see the prompt.</p>
    {/if}
  </div>

  <div class="field">
    <FieldLabel for="aiq-reply" text="2. Paste the AI's reply" />
    <textarea id="aiq-reply" class="textarea mono reply" rows="5" bind:value={reply} placeholder="Paste the whole reply here, including the XML code block"></textarea>
    {#if parsed?.error}
      <p class="status bad"><CircleAlert size={15} /> {parsed.error}</p>
    {:else if found.length}
      <div class="status ok">
        <CircleCheck size={15} />
        <div>
          Found {found.length === 1 ? 'a question' : `${found.length} questions`}:
          <ul>
            {#each found as f}<li><strong>{typeLabel(f.type)}</strong> · {questionTitle(f)}</li>{/each}
          </ul>
          {#if !current.adds && found.some((f) => f.type !== q.type)}<span class="warn">The question type has changed.</span>{/if}
        </div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Close</button>
    {#if current.adds}
      <button class="btn btn-primary" disabled={!found.length} onclick={() => apply(false)}>
        <ListPlus size={16} /> Add {found.length > 1 ? `${found.length} questions` : 'question'}
      </button>
    {:else}
      <button class="btn" disabled={!found.length} title="Keep the original and add the AI's version after it" onclick={() => apply(false)}><ListPlus size={16} /> Add as new</button>
      <button class="btn btn-primary" disabled={!found.length} onclick={() => apply(true)}><Replace size={16} /> Replace question</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .target {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--surface-2);
    font-size: 13px;
    min-width: 0;
  }
  .chip {
    flex: none;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 600;
  }
  .target-title {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tasks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 6px;
  }
  .task {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .task:hover {
    border-color: var(--border-strong);
  }
  .task.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .task input {
    grid-row: span 2;
    margin: 3px 0 0;
    accent-color: var(--accent);
  }
  .task-label {
    font-size: 13px;
    font-weight: 600;
  }
  .task-desc {
    font-size: 12px;
    color: var(--text-3);
  }
  .narrow {
    max-width: 260px;
  }
  .prompt {
    font-size: 12px;
    background: var(--surface-2);
  }
  .reply {
    font-size: 12px;
  }
  .empty {
    margin: 0;
    padding: 18px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--text-3);
    font-size: 13px;
    text-align: center;
  }
  .note {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 13px;
  }
  .note :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--accent);
  }
  .status {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
  }
  .status :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .status.bad {
    color: var(--danger);
  }
  .status.ok :global(svg) {
    color: var(--success);
  }
  .status ul {
    margin: 2px 0 0;
    padding-left: 18px;
    color: var(--text-2);
  }
  .warn {
    color: var(--warning);
  }
</style>
