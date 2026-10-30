<script>
  import { CircleCheck, TriangleAlert, ArrowRight, Shuffle, Trash, LoaderCircle } from '@lucide/svelte';
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Info from '../ui/Info.svelte';
  import { questionTitle, TYPE_MAP } from '../../lib/model.js';
  import { TYPE_ICONS } from '../../lib/icons.js';
  import { answerKeyReport, balanceAnswers, findDuplicates, LETTERS } from '../../lib/quality.js';
  import { app, library, closeModal, notify, select, switchQuiz, nextUnreviewed, setReviewed, deleteQuestion, loadAllQuizzes } from '../../lib/store.svelte.js';

  const questions = $derived(app.quiz.questions);
  const numberOf = (id) => questions.findIndex((q) => q.id === id) + 1;

  // ------------------------------------------------ review
  const total = $derived(questions.length);
  const toReview = $derived(questions.filter((q) => q.unreviewed).length);
  const reviewed = $derived(total - toReview);

  function reviewNext() {
    closeModal();
    nextUnreviewed();
  }

  // ------------------------------------------------ answer key
  const key = $derived(answerKeyReport(questions));
  const most = $derived(key.positions.length ? Math.max(...key.positions, ...key.expected) : 0);
  const top = $derived(key.positions.indexOf(Math.max(...key.positions)));

  function balance() {
    const n = balanceAnswers(app.quiz.questions);
    notify(n ? `Reordered the answers of ${n} question${n === 1 ? '' : 's'}. Undo with Ctrl+Z.` : 'The correct answers were already spread evenly.', 'success', 5000);
  }

  // ------------------------------------------------ duplicates
  let scope = $state('quiz');
  // The other quizzes, read from storage when "All quizzes" is chosen; the open quiz always uses its live copy.
  let others = $state(null);
  let loading = $state(false);

  async function chooseScope(value) {
    scope = value;
    if (value !== 'all' || others) return;
    loading = true;
    others = (await loadAllQuizzes()).filter((x) => x.id !== library.activeId);
    loading = false;
  }

  const groups = $derived.by(() => {
    const entries = questions.map((q) => ({ id: q.id, quizId: library.activeId, q }));
    if (scope === 'all' && others) {
      for (const o of others) o.quiz.questions.forEach((q, i) => entries.push({ id: q.id, quizId: o.id, quizName: o.name, n: i + 1, q }));
    }
    return findDuplicates(entries, { focus: library.activeId });
  });

  function open(entry) {
    closeModal();
    app.search = '';
    app.tab = 'edit';
    if (entry.quizId === library.activeId) select(entry.id);
    else switchQuiz(entry.quizId).then((ok) => ok && select(entry.id));
  }

  function openQuestion(id) {
    open({ id, quizId: library.activeId });
  }

  const pct = (x) => `${Math.round(x * 100)}%`;
</script>

<Modal
  title="Check questions"
  subtitle="Catch the usual problems of generated questions before you export: unchecked questions, a predictable answer key and repeated questions."
  width="720px"
  onclose={closeModal}
>
  <section>
    <h3>Review</h3>
    {#if !total}
      <p class="muted">This quiz has no questions yet.</p>
    {:else}
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={reviewed} aria-label="Reviewed questions">
        <span style:width="{(reviewed / total) * 100}%"></span>
      </div>
      <div class="row">
        {#if toReview}
          <p class="status warn"><TriangleAlert size={16} /> <span><strong>{toReview}</strong> of {total} question{total === 1 ? '' : 's'} still to review.</span></p>
          <button class="btn btn-sm" onclick={() => setReviewed(true)}>Mark all as reviewed</button>
          <button class="btn btn-primary btn-sm" data-autofocus onclick={reviewNext}>Review next <ArrowRight size={14} /></button>
        {:else}
          <p class="status ok"><CircleCheck size={16} /> <span>All {total} question{total === 1 ? ' is' : 's are'} reviewed.</span></p>
          <button class="btn btn-ghost btn-sm" title="Mark every question as still to review, to go through the quiz again" onclick={() => setReviewed(false)}>Review again</button>
        {/if}
      </div>
      <p class="hint">
        Imported questions are marked as to review. Read each one and its answers, then click <strong>Mark reviewed</strong> above the question (Alt+R), which opens the next one.
      </p>
    {/if}
  </section>

  <section>
    <h3>
      Answer key
      <Info text="Only single-answer multiple-choice questions are counted. Moodle can shuffle the answers when “Shuffle answers” is on, but printed papers and quizzes without shuffling use the order shown here." />
    </h3>
    {#if !key.questions.length}
      <p class="muted">No single-answer multiple-choice questions.</p>
    {:else}
      <div class="bars" aria-label="Position of the correct answer">
        {#each key.positions as n, i}
          <div class="bar-row" title="{n} correct answer{n === 1 ? '' : 's'} at {LETTERS[i]} (about {Math.round(key.expected[i])} if evenly spread)">
            <span class="letter">{LETTERS[i]}</span>
            <span class="track">
              <span class="fill" class:hot={key.skewed && i === top} style:width="{(n / most) * 100}%"></span>
              <span class="expected" style:left="{(key.expected[i] / most) * 100}%"></span>
            </span>
            <span class="count">{n}</span>
          </div>
        {/each}
      </div>
      <div class="row">
        {#if key.skewed}
          <p class="status warn">
            <TriangleAlert size={16} />
            <span>The correct answer is <strong>{LETTERS[top]}</strong> in {key.positions[top]} of {key.questions.length} questions, so students can guess it.</span>
          </p>
        {:else}
          <p class="status ok"><CircleCheck size={16} /> <span>The correct answers are spread well over the positions.</span></p>
        {/if}
        <button class="btn btn-sm" title="Reorder the answers so each position holds about as many correct answers. “All of the above” and similar answers stay in place." onclick={balance}>
          <Shuffle size={14} /> Spread evenly
        </button>
      </div>
      {#if key.longest.length}
        <div class="sub">
          <p class="status {key.longSkew ? 'warn' : 'note'}">
            {#if key.longSkew}<TriangleAlert size={16} />{/if}
            <span>The correct answer is clearly the longest in {key.longest.length} of {key.questions.length} question{key.questions.length === 1 ? '' : 's'}{key.longSkew ? ', a hint students learn to use' : ''}. Shorten it or lengthen the others:</span>
          </p>
          <ul class="list">
            {#each key.longest as q (q.id)}
              {@const Icon = TYPE_ICONS[q.type]}
              <li>
                <span class="num">{numberOf(q.id)}</span>
                <span class="icon"><Icon size={14} /></span>
                <span class="name">{questionTitle(q)}</span>
                <button class="btn btn-sm" onclick={() => openQuestion(q.id)}>Open <ArrowRight size={14} /></button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </section>

  <section>
    <div class="head">
      <h3>Repeated questions</h3>
      {#if library.quizzes.length > 1}
        <Segmented
          size="sm"
          label="Look for repeats in"
          bind:value={() => scope, chooseScope}
          options={[
            { value: 'quiz', label: 'This quiz' },
            { value: 'all', label: 'All quizzes' },
          ]}
        />
      {/if}
    </div>
    {#if loading}
      <p class="muted"><LoaderCircle size={14} class="spin" /> Reading your other quizzes…</p>
    {:else if !groups.length}
      <p class="status ok"><CircleCheck size={16} /> <span>No repeated questions found{scope === 'all' ? ' in any of your quizzes' : ''}.</span></p>
    {:else}
      <p class="status warn">
        <TriangleAlert size={16} />
        <span>{groups.length} set{groups.length === 1 ? '' : 's'} of questions that are the same or nearly so. Keep one of each and delete or rewrite the others.</span>
      </p>
      <div class="groups">
        {#each groups as g, gi (gi)}
          <div class="group">
            <div class="group-head">{g.score >= 0.999 ? 'Identical' : `Nearly the same (${pct(g.score)} of the words shared)`}</div>
            <ul class="list">
              {#each g.entries as e (e.quizId + e.id)}
                {@const Icon = TYPE_ICONS[e.q.type]}
                {@const own = e.quizId === library.activeId}
                <li>
                  <span class="num">{own ? numberOf(e.id) : e.n}</span>
                  <span class="icon" title={TYPE_MAP[e.q.type].label}><Icon size={14} /></span>
                  <span class="name">{questionTitle(e.q)}</span>
                  {#if !own}<span class="quiz" title="In the quiz “{e.quizName}”">{e.quizName}</span>{/if}
                  {#if own}
                    <button class="btn btn-ghost btn-icon btn-sm danger" title="Delete this question" aria-label="Delete question {numberOf(e.id)}" onclick={() => deleteQuestion(e.id)}><Trash size={14} /></button>
                  {/if}
                  <button class="btn btn-sm" onclick={() => open(e)}>Open <ArrowRight size={14} /></button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  {#snippet footer()}
    <button class="btn btn-primary" onclick={closeModal}>Done</button>
  {/snippet}
</Modal>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  section + section {
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .muted,
  .hint {
    margin: 0;
    color: var(--text-3);
    font-size: 13px;
  }
  .muted {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .status {
    flex: 1;
    min-width: 220px;
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
  }
  .status :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .status span {
    color: var(--text);
  }
  .status.ok {
    color: var(--success);
  }
  .status.warn {
    color: var(--warning);
  }
  .status.note span {
    color: var(--text-2);
  }
  .progress {
    height: 8px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--success);
    transition: width 0.2s;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .letter {
    width: 14px;
    font-weight: 600;
    color: var(--text-2);
  }
  .track {
    flex: 1;
    position: relative;
    height: 14px;
    border-radius: 4px;
    background: var(--surface-2);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
    background: var(--accent);
    opacity: 0.75;
  }
  .fill.hot {
    background: var(--warning);
    opacity: 1;
  }
  /* Where the bar would end if the correct answers were spread evenly. */
  .expected {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 0;
    border-left: 2px dashed var(--text-3);
  }
  .count {
    width: 28px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 340px;
    overflow-y: auto;
  }
  .group {
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .group-head {
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
  }
  .sub .list {
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    font-size: 13px;
  }
  .list li:hover {
    background: var(--hover);
  }
  .num {
    flex: none;
    min-width: 20px;
    text-align: right;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .icon {
    flex: none;
    display: inline-flex;
    color: var(--text-2);
  }
  .name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quiz {
    flex: none;
    max-width: 140px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-2);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
