<script>
  import { Check, X } from '@lucide/svelte';
  import Section from '../ui/Section.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import FieldLabel from '../ui/FieldLabel.svelte';
  import RichText from '../RichText.svelte';

  let { q = $bindable() } = $props();
</script>

<Section title="Correct answer" required>
  <Segmented
    bind:value={q.correct}
    label="Correct answer"
    options={[
      { value: true, label: 'True', icon: Check },
      { value: false, label: 'False', icon: X },
    ]}
  />
  <div class="grid-2">
    <div class="field">
      <FieldLabel text="Feedback for the response “True”" optional />
      <RichText bind:value={q.feedbacktrue} minHeight={60} placeholder="Shown when the student answers True" label="Feedback for True" />
    </div>
    <div class="field">
      <FieldLabel text="Feedback for the response “False”" optional />
      <RichText bind:value={q.feedbackfalse} minHeight={60} placeholder="Shown when the student answers False" label="Feedback for False" />
    </div>
  </div>
</Section>
