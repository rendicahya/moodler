<script>
  import Modal from '../ui/Modal.svelte';
  import { closeModal } from '../../lib/store.svelte.js';

  const mod = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl';
  const shortcuts = [
    [[mod, 'Z'], 'Undo'],
    [[mod, 'Shift', 'Z'], 'Redo (also ' + mod + '+Y)'],
    [[mod, 'S'], 'Export'],
    [[mod, 'O'], 'Import'],
    [['Alt', 'N'], 'Add a question'],
    [['Alt', 'P'], 'Show / hide the preview'],
    [['↑', '↓'], 'Select previous / next question (in the list)'],
    [['Alt', '↑ / ↓'], 'Move the selected question (in the list)'],
    [['Delete'], 'Delete the selected question (in the list)'],
  ];
</script>

<Modal title="Help" width="620px" onclose={closeModal}>
  <section>
    <h3>How it works</h3>
    <ul>
      <li>Everything runs in your browser. Your quiz is saved automatically to this browser’s local storage — nothing is uploaded.</li>
      <li>Export to <strong>Moodle XML</strong> for full fidelity. In Moodle, go to <em>Question bank → Import</em>, choose the same format and upload the file.</li>
      <li><strong>GIFT</strong> and <strong>Aiken</strong> are plain-text formats that only support some question types; unsupported questions are listed when exporting.</li>
      <li>Images pasted or inserted into the editor are embedded in Moodle XML exports.</li>
      <li>Drag the <span class="grip">⠿</span> handle to reorder questions, answers and items.</li>
      <li>Use <strong>Project (JSON)</strong> to back up your work or move it to another browser.</li>
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
