<script module>
  // Source material is kept for the session but never saved, so going off to paste the reply and coming back keeps it.
  const session = $state({ material: '', files: [] });
</script>

<script>
  import { Copy, Check, ClipboardPaste, Paperclip, FileText, X, LoaderCircle, TriangleAlert } from '@lucide/svelte';
  import { extractText, isSupported, MATERIAL_ACCEPT } from '../../lib/extract.js';
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
  let attach = $state(prefs.attach ?? false);
  // Named after the open quiz, unless it is still untitled: the name becomes the imported quiz's category.
  let category = $state(app.quiz.name && app.quiz.name !== 'Untitled quiz' ? app.quiz.name : '');
  let copied = $state(false);

  $effect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ topic, language, audience, difficulty, feedback, extra, counts, attach }));
    } catch {
      /* ignore */
    }
  });

  // ------------------------------------------------ material files
  let fileInput = $state();
  let dropping = $state(false);

  async function addFiles(list) {
    for (const file of list) {
      if (session.files.some((f) => f.name === file.name && f.size === file.size)) continue;
      const entry = { id: crypto.randomUUID?.() ?? String(Math.random()), name: file.name, size: file.size, status: 'reading', text: '', error: '' };
      session.files.push(entry);
      const item = session.files[session.files.length - 1];
      if (!isSupported(file.name)) {
        item.status = 'error';
        item.error = 'Not a supported file type';
        continue;
      }
      try {
        item.text = await extractText(file);
        item.status = item.text ? 'ok' : 'empty';
      } catch (e) {
        item.status = 'error';
        item.error = e?.message || 'Could not read the file';
      }
    }
  }

  function removeFile(id) {
    session.files = session.files.filter((f) => f.id !== id);
  }

  function ondrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropping = false;
    addFiles([...(e.dataTransfer?.files ?? [])]);
  }

  function ondragover(e) {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    // Keep the window's own handler, which refuses drops while a dialog is open, from cancelling this one.
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    dropping = true;
  }

  const reading = $derived(session.files.some((f) => f.status === 'reading'));
  const usable = $derived(session.files.filter((f) => f.status === 'ok' || f.status === 'empty'));
  // Files without text (such as scanned PDFs) can only be attached in the chatbot.
  const promptFiles = $derived(usable.map((f) => ({ name: f.name, text: attach ? '' : f.text })));
  const toAttach = $derived(promptFiles.filter((f) => !f.text).map((f) => f.name));
  const fmt = (n) => n.toLocaleString();

  const total = $derived(PROMPT_TYPES.reduce((s, t) => s + (counts[t.type] || 0), 0));
  const ready = $derived(total > 0 && !reading && !!(topic.trim() || session.material.trim() || usable.length));
  const prompt = $derived(
    ready ? buildPrompt({ topic, material: session.material, files: promptFiles, counts, difficulty, language, audience, category, feedback, extra }) : ''
  );
  // Roughly four characters per token; free chatbot plans may cut off very long messages.
  const tokens = $derived(Math.round(prompt.length / 4));
  const long = $derived(prompt.length > 100000);

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
    <FieldLabel
      for="ai-material"
      text="Source material"
      optional
      info="Add the files you teach from (slides, handouts, a book chapter) or paste text, and the questions will only test what they contain. Files are read in your browser and never uploaded."
    />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="files" class:dropping {ondragover} ondragleave={() => (dropping = false)} {ondrop}>
      {#each session.files as f (f.id)}
        <div class="file" class:bad={f.status === 'error'} class:empty={f.status === 'empty'}>
          <span class="file-icon">
            {#if f.status === 'reading'}<LoaderCircle size={16} class="spin" />{:else if f.status === 'error' || f.status === 'empty'}<TriangleAlert size={16} />{:else}<FileText size={16} />{/if}
          </span>
          <span class="file-name" title={f.name}>{f.name}</span>
          <span class="file-meta">
            {#if f.status === 'reading'}Reading…
            {:else if f.status === 'error'}{f.error}
            {:else if f.status === 'empty'}No text found (scanned?): attach it in the chatbot
            {:else if attach}To attach in the chatbot
            {:else}{fmt(f.text.length)} characters{/if}
          </span>
          <button class="btn btn-ghost btn-icon btn-sm" title="Remove" aria-label="Remove {f.name}" onclick={() => removeFile(f.id)}><X size={14} /></button>
        </div>
      {/each}
      <div class="add-files">
        <button class="btn btn-sm" onclick={() => fileInput.click()}><Paperclip size={14} /> Add files…</button>
        <span class="hint">PDF, Word, PowerPoint, OpenDocument or text files. You can also drop them here.</span>
      </div>
      <input bind:this={fileInput} type="file" multiple accept={MATERIAL_ACCEPT} hidden onchange={(e) => (addFiles([...e.currentTarget.files]), (e.currentTarget.value = ''))} />
    </div>
    {#if usable.length}
      <Switch
        bind:checked={attach}
        label="Attach the files in the chatbot instead"
        description="The prompt only names the files, and you attach them yourself when you paste it. Better for scanned PDFs and material whose pictures or tables matter."
      />
    {/if}
    <textarea id="ai-material" class="textarea" rows="3" bind:value={session.material} placeholder="…or paste the text the questions should be based on"></textarea>
  </div>

  <div class="field">
    <FieldLabel for="ai-extra" text="Other instructions" optional />
    <textarea id="ai-extra" class="textarea" rows="2" bind:value={extra} placeholder="e.g. Use real-world examples. Avoid “all of the above”."></textarea>
  </div>

  <div class="field">
    <FieldLabel for="ai-prompt" text="Prompt">
      {#if ready}<span class="total">{fmt(prompt.length)} characters, about {fmt(tokens)} tokens</span>{/if}
    </FieldLabel>
    {#if ready}
      <textarea id="ai-prompt" class="textarea mono prompt" rows="9" readonly value={prompt} onfocus={(e) => e.currentTarget.select()}></textarea>
      {#if toAttach.length}
        <p class="note"><Paperclip size={15} /> <span>When you paste the prompt, attach {toAttach.length === 1 ? 'this file' : 'these files'} in the chatbot too: <strong>{toAttach.join(', ')}</strong>.</span></p>
      {/if}
      {#if long}
        <p class="note warn">
          <TriangleAlert size={15} />
          <span>This prompt is very long. Some chatbots, especially free plans, cut off long messages. Use fewer or shorter files, or attach them in the chatbot instead.</span>
        </p>
      {/if}
    {:else}
      <p class="empty">{reading ? 'Reading the files…' : total ? 'Enter a topic or add source material to see the prompt.' : 'Choose at least one question.'}</p>
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
  .files {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    transition: border-color 0.12s, background 0.12s;
  }
  .files.dropping {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 8px;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 13px;
  }
  .file-icon {
    flex: none;
    display: inline-flex;
    color: var(--text-3);
  }
  .file-name {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-meta {
    flex: none;
    max-width: 50%;
    color: var(--text-3);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file.bad .file-icon,
  .file.bad .file-meta,
  .file.empty .file-icon {
    color: var(--warning);
  }
  .add-files {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .hint {
    font-size: 12px;
    color: var(--text-3);
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
  .note.warn {
    background: var(--warning-soft);
  }
  .note.warn :global(svg) {
    color: var(--warning);
  }
  .files :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
