<script>
  import Section from '../ui/Section.svelte';
  import Switch from '../ui/Switch.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import RichText from '../RichText.svelte';

  let { q = $bindable() } = $props();
</script>

<Section title="Response options">
  <div class="grid-3">
    <div class="field">
      <FieldLabel
        for="rf-{q.id}"
        text="Response format"
        info="The box students type their answer into. Choose “No online text” when students only upload files."
      />
      <select id="rf-{q.id}" class="select select-sm" bind:value={q.responseformat}>
        <option value="editor">HTML editor</option>
        <option value="editorfilepicker">HTML editor with file picker</option>
        <option value="plain">Plain text</option>
        <option value="monospaced">Plain text, monospaced font</option>
        <option value="noinline">No online text</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel for="rl-{q.id}" text="Input box size" info="The starting height of the response box. Students can still write more." />
      <select id="rl-{q.id}" class="select select-sm" bind:value={q.responsefieldlines}>
        {#each [2, 3, 5, 10, 15, 20, 25, 30, 35, 40] as n}<option value={n}>{n} lines</option>{/each}
      </select>
    </div>
    <div class="field">
      <FieldLabel text="Require text" info="When off, students may leave the text empty, e.g. when they submit an attachment instead." />
      <Switch bind:checked={q.responserequired} label="Student must enter text" />
    </div>
    <div class="field">
      <FieldLabel for="minw-{q.id}" text="Minimum word limit" optional />
      <input id="minw-{q.id}" class="input input-sm" type="number" min="0" placeholder="None" bind:value={q.minwordlimit} />
    </div>
    <div class="field">
      <FieldLabel for="maxw-{q.id}" text="Maximum word limit" optional />
      <input id="maxw-{q.id}" class="input input-sm" type="number" min="0" placeholder="None" bind:value={q.maxwordlimit} />
    </div>
  </div>
</Section>

<Section title="Attachments" optional collapsible open={q.attachments !== 0}>
  <div class="grid-3">
    <div class="field">
      <FieldLabel for="att-{q.id}" text="Allow attachments" info="How many files a student may upload with their answer." />
      <select id="att-{q.id}" class="select select-sm" bind:value={q.attachments}>
        <option value={0}>No</option>
        {#each [1, 2, 3] as n}<option value={n}>{n}</option>{/each}
        <option value={-1}>Unlimited</option>
      </select>
    </div>
    <div class="field">
      <FieldLabel for="attr-{q.id}" text="Required attachments" info="How many files a student must upload before the answer counts as complete." />
      <select id="attr-{q.id}" class="select select-sm" bind:value={q.attachmentsrequired} disabled={q.attachments === 0}>
        <option value={0}>Optional</option>
        {#each [1, 2, 3] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    <div class="field">
      <FieldLabel
        for="ft-{q.id}"
        text="Accepted file types"
        optional
        info="Extensions or groups separated by commas, e.g. .pdf, .docx, image. Leave empty to accept any file."
      />
      <input id="ft-{q.id}" class="input input-sm" placeholder="e.g. .pdf, .docx, image" bind:value={q.filetypeslist} disabled={q.attachments === 0} />
    </div>
  </div>
</Section>

<Section title="Response template & grader information" optional collapsible open={!!(q.responsetemplate || q.graderinfo)}>
  <div class="field">
    <FieldLabel text="Response template" optional info="Text that pre-fills the student’s response box, e.g. headings for a structured answer." />
    <RichText bind:value={q.responsetemplate} minHeight={70} placeholder="Text that pre-fills the response box" label="Response template" />
  </div>
  <div class="field">
    <FieldLabel text="Information for graders" optional info="Shown only to teachers while grading, e.g. a model answer or rubric. Students never see it." />
    <RichText bind:value={q.graderinfo} minHeight={70} placeholder="Marking guide, model answer, rubric…" label="Information for graders" />
  </div>
</Section>
