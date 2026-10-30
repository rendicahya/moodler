<script>
  import Modal from '../ui/Modal.svelte';
  import { closeModal } from '../../lib/store.svelte.js';

  const mod = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl';
  const shortcuts = [
    [[mod, 'Z'], 'Undo'],
    [[mod, 'Shift', 'Z'], 'Redo (also ' + mod + '+Y)'],
    [[mod, 'S'], 'Export'],
    [[mod, 'O'], 'Import'],
    [[mod, 'P'], 'Print or save as PDF'],
    [[mod, 'H'], 'Find and replace'],
    [[mod, ','], 'Quiz settings'],
    [['Alt', 'N'], 'Add a question'],
    [['Alt', 'Shift', 'N'], 'Start a new quiz (your other quizzes are kept)'],
    [['Alt', '1 – 9'], 'Go to quiz tab 1–8, or the last tab'],
    [['Alt', 'W'], 'Close the quiz tab, removing the quiz'],
    [['Alt', 'Delete'], 'Delete the question being edited (works anywhere)'],
    [['Alt', 'A'], 'Show / hide correct answers in the preview'],
    [['Alt', 'P'], 'Switch layout: editor only, both, preview only'],
    [['Alt', 'Page Up / Down'], 'Previous / next question (works anywhere)'],
    [['Alt', 'Home / End'], 'First / last question'],
    [['Alt', 'Q'], 'Preview the whole quiz'],
    [['Alt', 'G'], 'Generate questions with AI (write a prompt)'],
    [['Alt', 'R'], 'Mark the question reviewed and open the next one to review'],
    [['Alt', 'C'], 'Check questions: review progress, answer key, repeats'],
    [[mod, 'V'], 'Import pasted questions (outside text fields)'],
    [['↑', '↓'], 'Select previous / next question (in the list)'],
    [['Alt', '↑ / ↓'], 'Move the selected question (in the list)'],
    [['Space'], 'Tick / untick the question for bulk actions (in the list)'],
    [[mod, 'click'], 'Tick / untick a question; Shift+click ticks a range'],
    [[mod, 'A'], 'Tick all shown questions (in the list)'],
    [['Delete'], 'Delete the ticked questions, or the selected one (in the list)'],
  ];
</script>

<Modal title="Help" width="620px" onclose={closeModal}>
  <section>
    <h3>How it works</h3>
    <ul>
      <li>Everything runs in your browser. Your quiz is saved automatically in this browser’s storage — nothing is uploaded.</li>
      <li>Export to <strong>Moodle XML</strong> for full fidelity. In Moodle, go to <em>Question bank → Import</em>, choose the same format and upload the file.</li>
      <li><strong>GIFT</strong> and <strong>Aiken</strong> are plain-text formats that only support some question types; unsupported questions are listed when exporting.</li>
      <li>Images pasted or inserted into the editor are embedded in Moodle XML exports.</li>
      <li>Drag the <span class="grip">⠿</span> handle to reorder questions, answers and items.</li>
      <li>Drag a question onto another quiz's tab to move it there (hold Ctrl to copy), or hold it over the tab until it opens to drop it at a chosen place.</li>
      <li>Tick questions in the list (hover a number, or Ctrl+click) to export, edit, move, duplicate or delete several at once.</li>
      <li>
        Use <strong>Project (JSON)</strong> to back up your work or move it to another browser. When it's been a while, the save status at the top right turns into a
        <strong>Back up</strong> button that downloads a backup in one click.
      </li>
      <li>Moodler works offline once loaded, and can be installed as an app from your browser's menu.</li>
    </ul>
  </section>
  <section>
    <h3>Keyboard shortcuts</h3>
    <table>
      <tbody>
        {#each shortcuts as [keys, desc]}
          <tr>
            <td>{#each keys as k, i}{#if i}<span class="plus">+</span>{/if}<kbd>{k}</kbd>{/each}</td>
            <td>{desc}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  {#snippet footer()}
    <button class="btn btn-primary" onclick={closeModal}>Got it</button>
  {/snippet}
</Modal>

<style>
  h3 {
    font-size: 14px;
    margin-bottom: 8px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    color: var(--text-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
    color: var(--text-2);
  }
  td:first-child {
    width: 190px;
    white-space: nowrap;
  }
  .plus {
    margin: 0 3px;
    color: var(--text-3);
  }
  .grip {
    color: var(--text-3);
  }
</style>
