<script>
  import { Copy, Check, ClipboardPaste } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { PROMPT_TYPES, DIFFICULTIES, buildPrompt } from '../../lib/prompt.js';
  import { app, closeModal, openModal, notify } from '../../lib/store.svelte.js';

  const PREFS_KEY = 'mqe.aiPrompt';
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }
  const prefs = loadPrefs();

  // The browser's language, e.g. "Indonesian", as a starting point.
  function browserLanguage() {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(navigator.language.split('-')[0]);
    } catch {
      return 'English';
    }
  }
  const LANGUAGES = ['English', 'Indonesian', 'Arabic', 'Chinese', 'Dutch', 'French', 'German', 'Japanese', 'Korean', 'Malay', 'Portuguese', 'Spanish'];

  let topic = $state(prefs.topic ?? '');
  let language = $state(prefs.language || browserLanguage());
  let audience = $state(prefs.audience ?? '');
  let difficulty = $state(prefs.difficulty || 'mixed');
  let feedback = $state(prefs.feedback ?? true);
  let extra = $state(prefs.extra ?? '');
  let counts = $state({ multichoice: 10, ...prefs.counts });
  let material = $state('');
  // Named after the open quiz, unless it is still untitled: the name becomes the imported quiz's category.
  let category = $state(app.quiz.name && app.quiz.name !== 'Untitled quiz' ? app.quiz.name : '');
  let copied = $state(false);

  $effect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ topic, language, audience, difficulty, feedback, extra, counts }));
    } catch {
      /* ignore */
    }
  });

  const total = $derived(PROMPT_TYPES.reduce((s, t) => s + (counts[t.type] || 0), 0));
  const ready = $derived(total > 0 && !!(topic.trim() || material.trim()));
  const prompt = $derived(ready ? buildPrompt({ topic, material, counts, difficulty, language, audience, category, feedback, extra }) : '');

  function setCount(type, value) {
    counts[type] = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
      notify('Prompt copied. Paste it into your AI chatbot, then paste its reply into Moodler.', 'success', 5000);
    } catch {
      notify('Could not copy. Select the prompt and copy it yourself (Ctrl+C).', 'error');
    }
  }
</script>

<Modal
  title="Generate questions with AI"
  subtitle="Describe the questions you need and copy the prompt into ChatGPT, Claude, Gemini or another AI chatbot. It asks for Moodle XML, so you can paste the reply straight back into Moodler."
  width="860px"
  onclose={closeModal}
>
  <div class="grid-2">
    <div class="field">
      <FieldLabel for="ai-topic" text="Topic" required />
      <input id="ai-topic" class="input" bind:value={topic} placeholder="e.g. Photosynthesis, the French Revolution, SQL joins" data-autofocus />
    </div>
    <div class="field">
      <FieldLabel for="ai-audience" text="Students" optional />
      <input id="ai-audience" class="input" bind:value={audience} placeholder="e.g. Grade 8, first-year computer science students" />
    </div>
    <div class="field">
      <FieldLabel for="ai-lang" text="Language" />
      <input id="ai-lang" class="input" bind:value={language} list="ai-langs" />
      <datalist id="ai-langs">{#each LANGUAGES as l}<option value={l}></option>{/each}</datalist>
    </div>
    <div class="field">
      <FieldLabel for="ai-cat" text="Quiz name" optional info="Becomes the question bank category, and the name of the quiz when you import the reply as a new quiz." />
      <input id="ai-cat" class="input" bind:value={category} placeholder="e.g. Biology – Chapter 3" />
    </div>
  </div>

  <div class="field">
    <FieldLabel text="Difficulty" />
    <div><Segmented size="sm" label="Difficulty" bind:value={difficulty} options={DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))} /></div>
  </div>

  <div class="field">
    <FieldLabel text="Questions">
      <span class="total">{total} in total</span>
    </FieldLabel>
    <div class="types">
      {#each PROMPT_TYPES as t (t.type)}
        <label class="type" class:on={counts[t.type] > 0}>
          <input
            class="input input-sm count"
            type="number"
            min="0"
            max="100"
            value={counts[t.type] || 0}
            oninput={(e) => setCount(t.type, e.currentTarget.value)}
            onfocus={(e) => e.currentTarget.select()}
          />
          <span>{t.label}</span>
        </label>
      {/each}
    </div>
  </div>

  <Switch bind:checked={feedback} label="Ask for feedback" description="An explanation of the correct answer, and why each choice is right or wrong" />

  <div class="field">
    <FieldLabel for="ai-material" text="Source material" optional info="Paste a text, notes or a chapter summary, and the questions will only test what it contains." />
    <textarea id="ai-material" class="textarea" rows="3" bind:value={material} placeholder="Paste the text the questions should be based on"></textarea>
  </div>

  <div class="field">
    <FieldLabel for="ai-extra" text="Other instructions" optional />
    <textarea id="ai-extra" class="textarea" rows="2" bind:value={extra} placeholder="e.g. Use real-world examples. Avoid “all of the above”."></textarea>
  </div>

  <div class="field">
    <FieldLabel for="ai-prompt" text="Prompt" />
    {#if ready}
      <textarea id="ai-prompt" class="textarea mono prompt" rows="9" readonly value={prompt} onfocus={(e) => e.currentTarget.select()}></textarea>
    {:else}
      <p class="empty">{total ? 'Enter a topic or source material to see the prompt.' : 'Choose at least one question.'}</p>
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn paste" title="Open the import dialog to paste the AI's reply" onclick={() => openModal('import', { paste: true })}>
      <ClipboardPaste size={16} /> Paste AI reply…
    </button>
    <button class="btn" onclick={closeModal}>Close</button>
    <button class="btn btn-primary" disabled={!ready} onclick={copy}>
      {#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy prompt{/if}
    </button>
  {/snippet}
</Modal>

<style>
  .total {
    margin-left: auto;
    font-weight: 500;
    color: var(--text-3);
  }
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 6px 14px;
  }
  .type {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-2);
    cursor: pointer;
  }
  .type.on {
    color: var(--text);
    font-weight: 500;
  }
  .count {
    flex: none;
    width: 58px;
    padding: 0 4px 0 8px;
    font-variant-numeric: tabular-nums;
  }
  .type:not(.on) .count {
    color: var(--text-3);
  }
  .prompt {
    font-size: 12px;
    background: var(--surface-2);
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
  .paste {
    margin-right: auto;
  }
</style>
