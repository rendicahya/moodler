<script>
  import { Plus, GripVertical, Trash, CornerDownLeft } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import Info from '../ui/Info.svelte';
  import { moveItem, uid } from '../../lib/model.js';
  import { insertAtCaret } from '../../lib/caret.js';
  import { notify } from '../../lib/store.svelte.js';
  import { createSortable } from '../../lib/sortable.svelte.js';

  let { q = $bindable(), textId } = $props();

  const used = $derived(new Set([...(q.questiontext || '').matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]))));
  const GROUP_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#64748b'];

  // Placeholders refer to choices by position, so reordering must renumber them in the text.
  function renumber(map) {
    q.questiontext = q.questiontext.replace(/\[\[(\d+)\]\]/g, (m, n) => (map.has(Number(n)) ? `[[${map.get(Number(n))}]]` : m));
  }

  function move(from, to) {
    const order = q.choices.map((_, i) => i + 1);
    moveItem(order, from, to);
    moveItem(q.choices, from, to);
    renumber(new Map(order.map((oldNo, newIdx) => [oldNo, newIdx + 1])));
  }

  function remove(i) {
    const removed = i + 1;
    if (used.has(removed)) notify(`[[${removed}]] is used in the text and now refers to a missing choice.`, 'warning');
    q.choices.splice(i, 1);
    const map = new Map();
    for (let n = removed + 1; n <= q.choices.length + 1; n++) map.set(n, n - 1);
    renumber(map);
  }

  function insertPlaceholder(i) {
    const token = `[[${i + 1}]]`;
    if (!insertAtCaret(textId, token)) {
      q.questiontext = (q.questiontext || '') + ' ' + token;
      notify('Placeholder added to the end of the text. Click in the text first to insert at the cursor.', 'info');
    }
  }

  const sort = createSortable(move);
</script>

<Section
  title="Choices"
  subtitle="Write [[1]], [[2]], … in the question text where each correct choice belongs. Choices in the same group are offered together."
  required
  info="Every [[n]] in the text needs a choice at position n. Extra choices that aren’t used in the text act as distractors (wrong options)."
>
  {#snippet actions()}
    <Switch bind:checked={q.shuffleanswers} label="Shuffle" info="Shows the choices in a random order for each attempt." />
  {/snippet}
  <div class="choices">
    <div class="head">
      <span></span><span>#</span><span>Choice text</span><span
        >Group <Info
          text={q.type === 'ddwtos'
            ? 'Each gap only accepts choices from the same group as its correct answer. Groups are colour-coded, so students can see which choices fit which gaps.'
            : 'Each drop-down lists all choices in the same group as its correct answer. Use different groups to give different gaps their own options.'}
          label="About groups"
        /></span
      >
      {#if q.type === 'ddwtos'}<span
          >Unlimited <Info text="When ticked, the choice can be dropped into more than one gap. Otherwise it can be used only once." label="About unlimited" /></span
        >{/if}
      <span></span>
    </div>
    {#each q.choices as c, i (c.id)}
      {@const ind = sort.indicator(i)}
      <div class="row" class:dd={q.type === 'ddwtos'} class:drop-before={ind === 'before'} class:drop-after={ind === 'after'} {...sort.item(i)}>
        <span class="drag-handle" title="Drag to reorder" {...sort.handle(i)}><GripVertical size={15} /></span>
        <button class="token" class:unused={!used.has(i + 1)} title="Insert [[{i + 1}]] at the cursor" onclick={() => insertPlaceholder(i)}>
          [[{i + 1}]] <CornerDownLeft size={12} />
        </button>
        <input class="input input-sm" bind:value={c.text} placeholder="Choice {i + 1}" aria-label="Choice {i + 1}" />
        <select class="select select-sm group" bind:value={c.group} aria-label="Group" style:--g={GROUP_COLORS[(c.group - 1) % 8]}>
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as g}<option value={g}>{g}</option>{/each}
        </select>
        {#if q.type === 'ddwtos'}
          <span class="inf"><input type="checkbox" bind:checked={c.infinite} aria-label="Unlimited use" /></span>
        {/if}
        <button class="btn btn-ghost btn-icon btn-sm danger" aria-label="Remove choice" onclick={() => remove(i)}><Trash size={15} /></button>
      </div>
    {/each}
  </div>
  <div>
    <button class="btn btn-sm" onclick={() => q.choices.push({ id: uid(), text: '', group: 1, infinite: false })}><Plus size={15} /> Add choice</button>
  </div>
</Section>

<style>
  .choices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: 22px 74px 1fr 80px 30px;
    gap: 8px;
    align-items: center;
  }
  .head:has(~ .row.dd),
  .row.dd {
    grid-template-columns: 22px 74px 1fr 80px 70px 30px;
  }
  .head {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .head > span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .row {
    padding: 2px 0;
  }
  .token {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-family: var(--mono);
    font-size: 12px;
    cursor: pointer;
  }
  .token.unused {
    background: transparent;
    color: var(--text-3);
    border-style: dashed;
    border-color: var(--border-strong);
  }
  .group {
    border-left: 4px solid var(--g);
  }
  .inf {
    display: flex;
    justify-content: center;
  }
  .inf input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
</style>
