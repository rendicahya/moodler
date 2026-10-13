<script>
  import { Plus, GripVertical, Trash, ChevronUp, ChevronDown } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import RichText from '../RichText.svelte';
  import { moveItem, uid } from '../../lib/model.js';
  import { createSortable } from '../../lib/sortable.svelte.js';

  let { q = $bindable() } = $props();
  const sort = createSortable((from, to) => moveItem(q.items, from, to));
</script>

<Section title="Ordering options">
  <div class="grid-3">
    <div class="field">
      <FieldLabel for="layout-{q.id}" text="Layout" info="Whether the items are listed top to bottom or side by side." />
      <select id="layout-{q.id}" class="select select-sm" bind:value={q.layouttype}>
        <option value="VERTICAL">Vertical</option>
        <option value="HORIZONTAL">Horizontal</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel
        for="select-{q.id}"
        text="Item selection"
        info="Use all items, or only some in each attempt: a random selection, or a run of neighbouring items (contiguous subset)."
      />
      <select id="select-{q.id}" class="select select-sm" bind:value={q.selecttype}>
        <option value="ALL">Select all items</option>
        <option value="RANDOM">Select a random subset</option>
        <option value="CONTIGUOUS">Select a contiguous subset</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel for="count-{q.id}" text="Number of items shown" info="How many items each student gets when only a subset is used." />
      <input id="count-{q.id}" class="input input-sm" type="number" min="0" bind:value={q.selectcount} disabled={q.selecttype === 'ALL'} />
    </div>
    <div class="field">
      <FieldLabel
        for="grading-{q.id}"
        text="Grading type"
        info="How partial credit is given. All or nothing: full marks only for the exact order. Absolute position: credit for each item in its correct place. Relative options: credit for items placed correctly next to their neighbours. Longest subset: credit for the longest run that is in the right order."
      />
      <select id="grading-{q.id}" class="select select-sm" bind:value={q.gradingtype}>
        <option value="ALL_OR_NOTHING">All or nothing</option>
        <option value="ABSOLUTE_POSITION">Absolute position</option>
        <option value="RELATIVE_NEXT_EXCLUDE_LAST">Relative to the next item (excluding last)</option>
        <option value="RELATIVE_NEXT_INCLUDE_LAST">Relative to the next item (including last)</option>
        <option value="RELATIVE_ONE_PREVIOUS_AND_NEXT">Relative to both the previous and next items</option>
        <option value="RELATIVE_ALL_PREVIOUS_AND_NEXT">Relative to all the previous and next items</option>
        <option value="LONGEST_ORDERED_SUBSET">Longest ordered subset</option>
        <option value="LONGEST_CONTIGUOUS_SUBSET">Longest contiguous subset</option>
        <option value="RELATIVE_TO_CORRECT">Relative to correct position</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel for="num-{q.id}" text="Numbering style" info="How the items are labelled for students." />
      <select id="num-{q.id}" class="select select-sm" bind:value={q.numberingstyle}>
        <option value="none">No numbering</option>
        <option value="abc">a., b., c., …</option>
        <option value="ABCD">A., B., C., …</option>
        <option value="123">1., 2., 3., …</option>
        <option value="iii">i., ii., iii., …</option>
        <option value="IIII">I., II., III., …</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel text="Grading details" info="After the attempt, shows students how their score for this question was worked out." />
      <Switch bind:checked={q.showgrading} label="Show grading details" />
    </div>
  </div>
</Section>

<Section title="Items in correct order" subtitle="Students see these shuffled and must restore this order." required info="At least two items are needed.">
  <div class="items">
    {#each q.items as it, i (it.id)}
      {@const ind = sort.indicator(i)}
      <div class="item" class:drop-before={ind === 'before'} class:drop-after={ind === 'after'} class:dragging={sort.dragging === i} {...sort.item(i)}>
        <span class="drag-handle" title="Drag to reorder" {...sort.handle(i)}><GripVertical size={15} /></span>
        <span class="pos">{i + 1}</span>
        <RichText bind:value={it.text} compact placeholder="Item {i + 1}" label="Item {i + 1}" />
        <div class="btns">
          <button class="btn btn-ghost btn-icon btn-sm" aria-label="Move up" disabled={i === 0} onclick={() => moveItem(q.items, i, i - 1)}><ChevronUp size={15} /></button>
          <button class="btn btn-ghost btn-icon btn-sm" aria-label="Move down" disabled={i === q.items.length - 1} onclick={() => moveItem(q.items, i, i + 1)}
            ><ChevronDown size={15} /></button
          >
          <button class="btn btn-ghost btn-icon btn-sm danger" aria-label="Remove item" onclick={() => q.items.splice(i, 1)}><Trash size={15} /></button>
        </div>
      </div>
    {/each}
  </div>
  <div>
    <button class="btn btn-sm" onclick={() => q.items.push({ id: uid(), text: '' })}><Plus size={15} /> Add item</button>
  </div>
</Section>

<style>
  .items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .item {
    display: grid;
    grid-template-columns: 22px 26px 1fr auto;
    gap: 8px;
    align-items: start;
    padding: 2px 0;
  }
  .item.dragging {
    opacity: 0.4;
  }
  .item > .drag-handle {
    margin-top: 8px;
  }
  .pos {
    margin-top: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btns {
    display: flex;
    gap: 2px;
    margin-top: 4px;
  }
</style>
