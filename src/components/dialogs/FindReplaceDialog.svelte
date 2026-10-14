<script>
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import { questionTitle } from '../../lib/model.js';
  import { buildPattern, findInQuestion, replaceInQuestion, snippet } from '../../lib/findreplace.js';
  import { app, closeModal, notify, select } from '../../lib/store.svelte.js';

  let find = $state(app.modalProps.find ?? app.search ?? '');
  let replacement = $state('');
  let matchCase = $state(false);
  let wholeWord = $state(false);
  // With questions ticked in the list, the search can be limited to them.
  let scope = $state(app.checked.length ? 'checked' : 'all');

  const SHOWN = 100;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'es'}`;
  const qs = (n) => `${n} question${n === 1 ? '' : 's'}`;

  const re = $derived(buildPattern(find, { matchCase, wholeWord }));
  const results = $derived.by(() => {
    if (!re) return [];
    const ids = scope === 'checked' ? new Set(app.checked) : null;
    return app.quiz.questions
      .map((q, i) => ({ q, i, ...(ids && !ids.has(q.id) ? { count: 0 } : findInQuestion(q, re)) }))
      .filter((r) => r.count);
  });
  const total = $derived(results.reduce((s, r) => s + r.count, 0));

  function replaceOne(r) {
    const n = replaceInQuestion(r.q, re, replacement);
    notify(`Replaced ${plural(n, 'match')} in question ${r.i + 1}. Undo with Ctrl+Z.`, 'success', 2500);
  }

  function replaceAll() {
    const list = results;
    const n = list.reduce((s, r) => s + replaceInQuestion(r.q, re, replacement), 0);
    notify(`Replaced ${plural(n, 'match')} in ${qs(list.length)}. Undo with Ctrl+Z.`, 'success');
  }

  function open(id) {
    select(id);
    app.tab = 'edit';
    closeModal();
  }
</script>

<Modal title="Find and replace" subtitle="Searches names, question text, answers, choices, feedback and hints. Tags, images and links are left alone." width="680px" onclose={closeModal}>
  <div class="grid-2">
    <div class="field">
      <FieldLabel for="fr-find" text="Find" />
      <input id="fr-find" class="input" bind:value={find} placeholder="Text to find" autocomplete="off" spellcheck="false" data-autofocus />
    </div>
    <div class="field">
      <FieldLabel for="fr-replace" text="Replace with" optional />
      <input
        id="fr-replace"
        class="input"
        bind:value={replacement}
        placeholder="Leave empty to delete"
        autocomplete="off"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Enter' && total && replaceAll()}
      />
    </div>
  </div>

  <div class="options">
    <Switch bind:checked={matchCase} label="Match case" />
    <Switch bind:checked={wholeWord} label="Whole words" />
    {#if app.checked.length}
      <Segmented
        size="sm"
        label="Search in"
        bind:value={scope}
        options={[
          { value: 'checked', label: `Selected (${app.checked.length})` },
          { value: 'all', label: 'All questions' },
        ]}
      />
    {/if}
  </div>

  <div class="results" aria-live="polite">
    {#if !re}
      <p class="muted">Type something to find.</p>
    {:else if !total}
      <p class="muted">No matches.</p>
    {:else}
      <p class="summary"><strong>{plural(total, 'match')}</strong> in {qs(results.length)}</p>
      <ul class="list">
        {#each results.slice(0, SHOWN) as r (r.q.id)}
          {@const s = snippet(r.q, re)}
          <li class="row">
            <span class="num">{r.i + 1}</span>
            <div class="body">
              <button class="title" title="Open this question" onclick={() => open(r.q.id)}>{questionTitle(r.q)}</button>
              {#if s}<span class="snip">{s[0]}<mark>{s[1]}</mark>{s[2]}</span>{/if}
              <span class="where">{r.where.join(', ')} · {plural(r.count, 'match')}</span>
            </div>
            <button class="btn btn-sm" title="Replace the matches in this question" onclick={() => replaceOne(r)}>Replace</button>
          </li>
        {/each}
      </ul>
      {#if results.length > SHOWN}<p class="muted">…and {qs(results.length - SHOWN)} more.</p>{/if}
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn" onclick={closeModal}>Close</button>
    <button class="btn btn-primary" disabled={!total} onclick={replaceAll}>
      Replace all{total ? ` (${total})` : ''}
    </button>
  {/snippet}
</Modal>

<style>
  .options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 22px;
  }
  .options > :global(:last-child:not(label)) {
    margin-left: auto;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 120px;
  }
  .muted {
    color: var(--text-3);
    font-size: 13px;
  }
  .summary {
    font-size: 13px;
    color: var(--text-2);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
  }
  .row + .row {
    border-top: 1px solid var(--border);
  }
  .num {
    flex: none;
    min-width: 22px;
    padding-top: 1px;
    color: var(--text-3);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    align-self: flex-start;
    max-width: 100%;
    padding: 0;
    border: none;
    background: none;
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .title:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .snip {
    font-size: 13px;
    color: var(--text-2);
    overflow-wrap: anywhere;
  }
  mark {
    padding: 0 1px;
    border-radius: 3px;
    background: color-mix(in srgb, #f59e0b 35%, transparent);
    color: inherit;
  }
  .where {
    font-size: 12px;
    color: var(--text-3);
  }
</style>
