<script>
  import { CircleCheck, TriangleAlert, ArrowRight, Shuffle, Trash, LoaderCircle } from '@lucide/svelte';
  import { tick } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Info from '../ui/Info.svelte';
  import { questionTitle, TYPE_MAP } from '../../lib/model.js';
  import { TYPE_ICONS } from '../../lib/icons.js';
  import {
    answerKeyReport,
    balanceAnswers,
    findDuplicates,
    LETTERS,
    placeProblem,
    fixPlace,
    lookAlikeAnswers,
    imagesWithoutAlt,
    setImageAlt,
    placeName,
  } from '../../lib/quality.js';
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

  // ------------------------------------------------ answers
  const placed = $derived(questions.map((q) => ({ q, problem: placeProblem(q) })).filter((x) => x.problem));
  const alike = $derived(questions.map((q) => ({ q, pairs: lookAlikeAnswers(q) })).filter((x) => x.pairs.length));

  async function fixPlaces(list, e) {
    const dialog = e?.currentTarget.closest('[role=dialog]');
    let n = 0;
    for (const { q } of list) if (fixPlace(q)) n++;
    if (n) notify(`Fixed ${n} question${n === 1 ? '' : 's'}. Undo with Ctrl+Z.`, 'success', 4000);
    await tick();
    if (dialog && !dialog.contains(document.activeElement)) keepFocus(dialog)?.focus();
  }

  const pairText = (p) => {
    const what = { answers: 'Answers', items: 'Items', questions: 'Pairs', choices: 'Choices' }[p.what];
    return `${what} ${p.a} and ${p.b} ${p.kind === 'same' ? 'are the same' : 'have the same words'}`;
  };

  // ------------------------------------------------ images
  const images = $derived(questions.flatMap((q) => imagesWithoutAlt(q).map((img) => ({ q, ...img, key: `${q.id}:${img.path.join('.')}:${img.index}` }))));
  let drafts = $state({});

  let imageList = $state();

  async function saveAlt(img) {
    const text = (drafts[img.key] ?? '').trim();
    if (!text) return;
    const at = images.findIndex((x) => x.key === img.key);
    const dialog = imageList?.closest('[role=dialog]');
    setImageAlt(img.q, img.path, img.index, text);
    delete drafts[img.key];
    // The row goes away; carry on with the next picture, or keep the focus in the dialog so Escape still works.
    await tick();
    const inputs = imageList?.querySelectorAll('input') ?? [];
    (inputs[Math.min(at, inputs.length - 1)] ?? keepFocus(dialog))?.focus();
  }

  // A button inside the dialog to move the focus to when the focused row disappears.
  const keepFocus = (dialog) => dialog?.querySelector('footer button') ?? dialog?.querySelector('button');

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
  subtitle="Catch the usual problems before you export: unchecked questions, a predictable answer key, answers that depend on their place or look alike, pictures without a description and repeated questions."
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
      <Info text="The positions count only single-answer multiple-choice questions; answer lengths are checked in multiple-answer ones too. Moodle can shuffle the answers when “Shuffle answers” is on, but printed papers and quizzes without shuffling use the order shown here." />
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
    {/if}
      {#if key.longest.length}
        <div class="sub">
          <p class="status {key.longSkew ? 'warn' : 'note'}">
            {#if key.longSkew}<TriangleAlert size={16} />{/if}
            <span>
              The correct answer is clearly the longest in {key.longest.length} of {key.longPool} multiple-choice question{key.longPool === 1 ? '' : 's'}. Students who aren't sure tend to pick the longest answer, so it gives the answer away,
              and AI chatbots often write questions like this. Shorten it or make the wrong answers just as detailed:
            </span>
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
  </section>

  <section>
    <h3>
      Answers
      <Info
        text="Moodle shuffles the answers when both the question's “Shuffle the choices” and the quiz's “Shuffle within questions” are on, so “All of the above” can end up at the top. Answers that read the same are confusing, and a question can't be answered fairly when two of them are the same."
      />
    </h3>
    {#if !placed.length && !alike.length}
      <p class="status ok"><CircleCheck size={16} /> <span>No answers that depend on their place or look alike.</span></p>
    {/if}
    {#if placed.length}
      <div class="sub">
        <div class="row">
          <p class="status warn">
            <TriangleAlert size={16} />
            <span>
              {placed.length} question{placed.length === 1 ? ' has' : 's have'} an answer like “All of the above” or “A and B” that only makes sense in its place.
              Fix turns off shuffling and moves “… of the above” to the end.
            </span>
          </p>
          {#if placed.length > 1}<button class="btn btn-sm" onclick={(e) => fixPlaces(placed, e)}>Fix all</button>{/if}
        </div>
        <ul class="list">
          {#each placed as { q, problem } (q.id)}
            {@const Icon = TYPE_ICONS[q.type]}
            <li>
              <span class="num">{numberOf(q.id)}</span>
              <span class="icon"><Icon size={14} /></span>
              <span class="name">{questionTitle(q)}</span>
              <span class="why">{problem === 'shuffled' ? 'answers are shuffled' : 'not the last answer'}</span>
              <button class="btn btn-sm" onclick={(e) => fixPlaces([{ q }], e)}>Fix</button>
              <button class="btn btn-ghost btn-sm" onclick={() => openQuestion(q.id)}>Open <ArrowRight size={14} /></button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if alike.length}
      <div class="sub">
        <p class="status warn">
          <TriangleAlert size={16} />
          <span>{alike.length} question{alike.length === 1 ? ' has' : 's have'} answers that look alike. Rewrite or remove one of each pair:</span>
        </p>
        <ul class="list">
          {#each alike as { q, pairs } (q.id)}
            {@const Icon = TYPE_ICONS[q.type]}
            <li>
              <span class="num">{numberOf(q.id)}</span>
              <span class="icon"><Icon size={14} /></span>
              <span class="name">{questionTitle(q)}</span>
              <span class="why">{pairs.map(pairText).join('; ')}</span>
              <button class="btn btn-sm" onclick={() => openQuestion(q.id)}>Open <ArrowRight size={14} /></button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>

  <section>
    <h3>
      Image descriptions
      <Info text="Screen readers read a picture's description (its alt text) to students who can't see it. A file name such as image.png says nothing about what the picture shows." />
    </h3>
    {#if !images.length}
      <p class="status ok"><CircleCheck size={16} /> <span>{questions.some((q) => /<img\b/i.test(JSON.stringify(q))) ? 'Every picture has a description.' : 'No pictures in this quiz.'}</span></p>
    {:else}
      <p class="status warn">
        <TriangleAlert size={16} />
        <span>{images.length} picture{images.length === 1 ? ' has' : 's have'} no description. Type what each one shows and press Enter:</span>
      </p>
      <ul class="list images" bind:this={imageList}>
        {#each images as img (img.key)}
          <li>
            <span class="num">{numberOf(img.q.id)}</span>
            {#if img.src}<img class="thumb" src={img.src} alt="" />{/if}
            <span class="img-fields">
              <span class="where">In {placeName(img.path)}{img.alt ? ` · now “${img.alt}”` : ''}</span>
              <span class="alt-row">
                <input
                  class="input"
                  placeholder="Describe the picture, e.g. “Graph of y = x² from −2 to 2”"
                  aria-label="Description of the picture in question {numberOf(img.q.id)}, {placeName(img.path)}"
                  bind:value={drafts[img.key]}
                  onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), saveAlt(img))}
                />
                <button class="btn btn-sm" disabled={!drafts[img.key]?.trim()} onclick={() => saveAlt(img)}>Save</button>
              </span>
            </span>
          </li>
        {/each}
      </ul>
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
  .why {
    flex: none;
    max-width: 45%;
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .images {
    max-height: 320px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .images li {
    align-items: flex-start;
    padding: 6px;
  }
  .images .num {
    padding-top: 2px;
  }
  .thumb {
    flex: none;
    width: 56px;
    height: 42px;
    object-fit: contain;
    border-radius: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .img-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .where {
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .alt-row {
    display: flex;
    gap: 6px;
  }
  .alt-row input {
    flex: 1;
    min-width: 0;
    height: 30px;
  }
  @media (max-width: 600px) {
    .list li {
      flex-wrap: wrap;
    }
    .why {
      max-width: none;
      flex-basis: 100%;
      order: 5;
      padding-left: 28px;
      white-space: normal;
    }
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
