<script>
  import Modal from '../ui/Modal.svelte';
  import { closeModal } from '../../lib/store.svelte.js';

  const mod = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl';
  const shortcuts = [
    [[mod, 'Z'], 'Undo'],
    [[mod, 'Shift', 'Z'], 'Redo (also ' + mod + '+Y)'],
    [[mod, 'S'], 'Export, or upload the changes of a quiz from the cloud'],
    [[mod, 'O'], 'Import'],
    [[mod, 'P'], 'Print, or save as PDF or Word'],
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
    [['Alt', 'I'], 'Improve the open question with AI'],
    [['Alt', 'R'], 'Mark the question reviewed and open the next one to review'],
    [['Alt', 'Shift', 'R'], 'Mark the question as not reviewed'],
    [['Alt', 'C'], 'Check questions: review progress, answer key, answers, pictures, repeats'],
    [['Alt', 'B'], 'Question bank: copy questions from your other quizzes'],
    [['Alt', 'U'], 'Upload the changes to the cloud copy (or open Cloud)'],
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
      <li>Everything runs in your browser. Your quiz is saved automatically in this browser’s storage, and nothing is uploaded unless you use the <strong>Cloud</strong> button.</li>
      <li>
        The <strong>Cloud</strong> button signs you in with Google so you can upload the open quiz to your private folders, create new quizzes there, and open them on any device. Quizzes that are in the cloud upload their changes
        automatically a few seconds after you stop editing, or straight away with the <strong>Save</strong> button at the top (Ctrl+S). The last 5 uploads of each quiz are kept, and deleted quizzes and folders stay in the trash
        for 30 days.
      </li>
      <li>
        <strong>Print</strong> (Ctrl+P) can make up to four exam versions (A–D) with the questions and answers in another order, and a bubble answer sheet. <strong>Mark answer sheets</strong> scores the sheets from typed answers or photos
        of them.
      </li>
      <li>Export to <strong>Moodle XML</strong> for full fidelity. In Moodle, go to <em>Question bank → Import</em>, choose the same format and upload the file.</li>
      <li><strong>GIFT</strong> and <strong>Aiken</strong> are plain-text formats that only support some question types; unsupported questions are listed when exporting.</li>
      <li><strong>ExamView XML</strong> is for ExamView Test Generator (File → Import → ExamView XML), as a test or as a question bank.</li>
      <li>Images pasted or inserted into the editor are embedded in Moodle XML exports. Large images are made smaller automatically; the notification has a button to keep the original.</li>
      <li>The <strong>question bank</strong> button next to <em>Add question</em> (Alt+B) copies questions from your other quizzes into this one.</li>
      <li>Right-click a question in the list, or the editor outside a text field, for its actions. Right-click an image in the editor or the live preview to export it.</li>
      <li>Select text in the live preview to make it bold, italic, underlined, struck through or code, or to clear its formatting.</li>
      <li>The <strong>code block</strong> button in a text editor's toolbar inserts code with syntax highlighting for the chosen language. The colours are saved in the question, so students see them in Moodle too. Double-click a code block to edit it.</li>
      <li>In the question list, questions marked reviewed show a green check. For a quiz that doesn't need review, turn off <em>Questions need review</em> in <strong>Settings</strong>.</li>
      <li>Drag a question in the list to reorder it (or press Alt+↑/↓), and drag the <span class="grip">⠿</span> handle to reorder answers and items.</li>
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
