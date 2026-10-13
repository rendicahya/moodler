<script>
  import { Plus, Pencil, Trash, CircleQuestionMark } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import ClozeGapDialog from './ClozeGapDialog.svelte';
  import { parseCloze, CLOZE_TYPES, isChoiceCloze } from '../../lib/formats/cloze.js';
  import { decodeEntities, round } from '../../lib/model.js';
  import { insertAtCaret } from '../../lib/caret.js';
  import { notify } from '../../lib/store.svelte.js';

  let { q = $bindable(), textId } = $props();

  const gaps = $derived(parseCloze(q.questiontext));
  const totalWeight = $derived(gaps.reduce((s, g) => s + g.weight, 0));
  const typeLabel = (t) => CLOZE_TYPES.find((c) => c.value === t)?.label ?? t;

  let dialog = $state(null); // { gap?: parsed gap }
  let showHelp = $state(false);

  const htmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function decoded(gap) {
    return {
      ...gap,
      answers: gap.answers.map((a) => ({ ...a, text: decodeEntities(a.text), feedback: decodeEntities(a.feedback) })),
    };
  }

  function save(syntax) {
    const g = dialog.gap;
    if (g) {
      const t = q.questiontext;
      q.questiontext = t.slice(0, g.index) + htmlEscape(syntax) + t.slice(g.index + g.raw.length);
    } else if (!insertAtCaret(textId, syntax)) {
      q.questiontext = (q.questiontext || '') + ' ' + htmlEscape(syntax);
      notify('Gap added to the end of the text. Click in the text first to insert at the cursor.', 'info');
    }
    dialog = null;
  }

  function remove(g) {
    q.questiontext = q.questiontext.slice(0, g.index) + q.questiontext.slice(g.index + g.raw.length);
  }

  function summary(g) {
    if (isChoiceCloze(g.type)) return g.answers.map((a) => (a.fraction > 0 ? `✓ ${a.text}` : a.text)).join(' · ');
    return g.answers
      .filter((a) => a.fraction > 0)
      .map((a) => `${a.text}${a.tolerance ? ` ±${a.tolerance}` : ''}${a.fraction !== 100 ? ` (${round(a.fraction, 2)}%)` : ''}`)
      .join(' · ');
  }
</script>

<Section
  title="Embedded answers"
  subtitle="Gaps are written inside the question text using Cloze syntax, e.g. {'{1:SHORTANSWER:=Paris}'}"
  required
  info="At least one gap is needed. Each gap is marked separately and its weight is its share of the marks; the question’s total mark is the sum of the weights."
>
  {#snippet actions()}
    <button class="btn btn-sm btn-ghost" onclick={() => (showHelp = !showHelp)}><CircleQuestionMark size={15} /> Syntax</button>
    <button class="btn btn-sm btn-primary" onclick={() => (dialog = { gap: null })}><Plus size={15} /> Insert gap</button>
  {/snippet}

  {#if showHelp}
    <div class="help">
      <p><code>{'{weight:TYPE:answers}'}</code> — answers are separated by <code>~</code>. Prefix the correct answer with <code>=</code> or a grade like <code>%50%</code>. Add feedback after <code>#</code>.</p>
      <ul>
        <li><code>{'{1:SHORTANSWER:=Paris#Correct!~%50%paris#Check capitalisation}'}</code></li>
        <li><code>{'{2:MULTICHOICE:London~=Paris~Rome}'}</code> — drop-down; <code>MULTICHOICE_V</code>/<code>_H</code> for radio buttons</li>
        <li><code>{'{1:NUMERICAL:=3.14:0.01}'}</code> — value with tolerance</li>
        <li><code>{'{1:MULTIRESPONSE:%50%A~%50%B~%-100%C}'}</code> — checkboxes</li>
      </ul>
      <p>Escape <code>{'}'}</code>, <code>#</code>, <code>~</code>, <code>/</code>, <code>"</code> and <code>\</code> with a backslash inside answers.</p>
    </div>
  {/if}

  {#if gaps.length}
    <div class="gaps">
      {#each gaps as g, i}
        <div class="gap">
          <span class="idx">{i + 1}</span>
          <div class="info">
            <div class="top">
              <span class="badge accent">{typeLabel(g.type)}</span>
              <span class="badge">{g.weight} mark{g.weight === 1 ? '' : 's'}</span>
            </div>
            <div class="ans">{decodeEntities(summary(g)) || '—'}</div>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" title="Edit gap" aria-label="Edit gap" onclick={() => (dialog = { gap: decoded(g) })}><Pencil size={15} /></button>
          <button class="btn btn-ghost btn-icon btn-sm danger" title="Remove gap" aria-label="Remove gap" onclick={() => remove(g)}><Trash size={15} /></button>
        </div>
      {/each}
    </div>
    <p class="hint">{gaps.length} gap{gaps.length === 1 ? '' : 's'} · total weight {totalWeight}. The question's default mark is calculated by Moodle from these weights.</p>
  {:else}
    <p class="empty">No gaps yet. Place the cursor in the question text and click <strong>Insert gap</strong>.</p>
  {/if}
</Section>

{#if dialog}
  <ClozeGapDialog gap={dialog.gap} onsave={save} onclose={() => (dialog = null)} />
{/if}

<style>
  .help {
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .help ul {
    margin: 0;
    padding-left: 18px;
  }
  .gaps {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gap {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .idx {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .top {
    display: flex;
    gap: 6px;
  }
  .ans {
    font-size: 13px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
