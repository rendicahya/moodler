<script>
  import { Plus, Upload, ChevronLeft, ChevronRight, FileText } from '@lucide/svelte';
  import Header from './components/Header.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import QuestionEditor from './components/QuestionEditor.svelte';
  import Toasts from './components/ui/Toasts.svelte';
  import ConfirmDialog from './components/ui/ConfirmDialog.svelte';
  import AddQuestionDialog from './components/dialogs/AddQuestionDialog.svelte';
  import ImportDialog from './components/dialogs/ImportDialog.svelte';
  import ExportDialog from './components/dialogs/ExportDialog.svelte';
  import SettingsDialog from './components/dialogs/SettingsDialog.svelte';
  import HelpDialog from './components/dialogs/HelpDialog.svelte';
  import BulkEditDialog from './components/dialogs/BulkEditDialog.svelte';
  import QuizPreviewDialog from './components/dialogs/QuizPreviewDialog.svelte';
  import PrintDialog from './components/dialogs/PrintDialog.svelte';
  import FindReplaceDialog from './components/dialogs/FindReplaceDialog.svelte';
  import QuizzesDialog from './components/dialogs/QuizzesDialog.svelte';
  import CopyToQuizDialog from './components/dialogs/CopyToQuizDialog.svelte';
  import QuizTabs from './components/QuizTabs.svelte';
  import { app, library, byRecent, switchQuiz, switchToTab, closeTab, initPersistence, undo, redo, openModal, notify, selectedQuestion, selectedIndex, addQuestion, deleteQuestion, newQuiz, cycleView, goToQuestion, setSidebarWidth, saveLayout, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from './lib/store.svelte.js';
  import { QUESTION_TYPES } from './lib/model.js';
  import { looksLikeQuestions } from './lib/formats/index.js';
  import { TYPE_ICONS } from './lib/icons.js';

  initPersistence();

  const q = $derived(selectedQuestion());
  const index = $derived(selectedIndex());
  const otherQuizzes = $derived(library.quizzes.filter((other) => other.id !== library.activeId && other.count).sort(byRecent));

  // On narrow screens the sidebar is an overlay; close it after picking a question.
  let narrow = $state(window.matchMedia('(max-width: 800px)').matches);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    const update = () => {
      narrow = mq.matches;
      if (narrow) app.sidebarOpen = false;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
  $effect(() => {
    app.selectedId;
    if (narrow) app.sidebarOpen = false;
  });

  let resizing = $state(false);
  function startResize(e) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startW = app.sidebarWidth;
    const move = (ev) => setSidebarWidth(startW + ev.clientX - startX);
    const up = () => {
      resizing = false;
      saveLayout();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function resizeKey(e) {
    const step = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0;
    if (!step) return;
    e.preventDefault();
    setSidebarWidth(app.sidebarWidth + step);
    saveLayout();
  }

  function isTyping(e) {
    const t = e.target;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  // Pasting questions (or a question file) anywhere outside a text field opens the import dialog with them.
  function onpaste(e) {
    if (app.modal || app.confirm || isTyping(e)) return;
    const file = e.clipboardData?.files?.[0];
    if (file) {
      e.preventDefault();
      openModal('import', { file });
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!looksLikeQuestions(text)) {
      if (text.trim()) notify('The pasted text doesn’t look like questions in a format Moodler can import.', 'info');
      return;
    }
    e.preventDefault();
    openModal('import', { text });
  }

  // Dropping a question file anywhere on the window opens the import dialog with it.
  let fileDrag = $state(false);
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const canDrop = () => !app.modal && !app.confirm;

  function ondragenter(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    if (canDrop()) fileDrag = true;
  }
  function ondragleave(e) {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) {
      dragDepth = 0;
      fileDrag = false;
    }
  }
  function ondragover(e) {
    if (!hasFiles(e)) return;
    // Always cancel so a stray drop never makes the browser navigate away to the file.
    e.preventDefault();
    if (!canDrop()) e.dataTransfer.dropEffect = 'none';
  }
  function ondrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    fileDrag = false;
    const file = e.dataTransfer.files[0];
    if (file && canDrop()) openModal('import', { file });
  }

  function onkeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // Also works inside the whole-quiz preview, which shares the same switch.
    if (e.altKey && !mod && key === 'a' && !app.confirm && (!app.modal || app.modal === 'quiz-preview')) {
      e.preventDefault();
      app.revealAnswers = !app.revealAnswers;
      return;
    }
    if (app.modal || app.confirm) return;
    if (mod && key === 'z' && !e.shiftKey) {
      // Let native undo work inside text fields that have their own history.
      if (isTyping(e) && !e.target.isContentEditable) return;
      e.preventDefault();
      undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      if (isTyping(e) && !e.target.isContentEditable) return;
      e.preventDefault();
      redo();
    } else if (mod && key === 's') {
      e.preventDefault();
      openModal('export');
    } else if (mod && key === 'o') {
      e.preventDefault();
      openModal('import');
    } else if (mod && key === 'p' && app.quiz.questions.length) {
      // Printing the editor itself is never useful; print the quiz instead.
      e.preventDefault();
      openModal('print');
    } else if (mod && key === 'h' && app.quiz.questions.length) {
      e.preventDefault();
      openModal('find');
    } else if (mod && e.key === ',') {
      e.preventDefault();
      openModal('settings');
    } else if (e.altKey && key === 'o') {
      e.preventDefault();
      openModal('quizzes');
    } else if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
      // Like a browser: Alt+1–8 open that tab, Alt+9 the last one.
      e.preventDefault();
      switchToTab(e.key === '9' ? -1 : Number(e.key) - 1);
    } else if (e.altKey && key === 'w') {
      e.preventDefault();
      closeTab(library.activeId);
    } else if (e.altKey && e.shiftKey && key === 'n') {
      e.preventDefault();
      newQuiz();
    } else if (e.altKey && e.key === 'Delete' && q) {
      // Works anywhere, including while typing, unlike plain Delete in the list.
      e.preventDefault();
      deleteQuestion(q.id);
    } else if (e.altKey && key === 'n') {
      e.preventDefault();
      openModal('add');
    } else if (e.altKey && key === 'p' && q) {
      e.preventDefault();
      cycleView();
    } else if (e.altKey && (e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End') && q) {
      // Step through questions from anywhere, including while typing.
      e.preventDefault();
      goToQuestion({ PageUp: -1, PageDown: 1, Home: -Infinity, End: Infinity }[e.key]);
    } else if (e.altKey && key === 'q' && app.quiz.questions.length) {
      e.preventDefault();
      openModal('quiz-preview');
    }
  }
</script>

<svelte:window {onkeydown} {onpaste} {ondragenter} {ondragleave} {ondragover} {ondrop} />

{#if fileDrag}
  <div class="drop-overlay" aria-hidden="true">
    <div class="drop-card">
      <Upload size={32} />
      <strong>Drop to open the file</strong>
      <span>Moodle XML (.xml), GIFT / Aiken (.txt, .gift) or project (.json)</span>
    </div>
  </div>
{/if}

<div class="app">
  <Header />
  <QuizTabs />
  <div class="main">
    {#if app.sidebarOpen}
      {#if narrow}
        <button class="scrim" aria-label="Close question list" onclick={() => (app.sidebarOpen = false)}></button>
      {/if}
      <div class="side" class:overlay={narrow} class:resizing style:--sidebar-w="{app.sidebarWidth}px">
        <Sidebar />
        {#if !narrow}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            class="resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize question list"
            aria-valuenow={app.sidebarWidth}
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            tabindex="0"
            title="Drag to resize, double-click to reset"
            onpointerdown={startResize}
            onkeydown={resizeKey}
            ondblclick={() => (setSidebarWidth(SIDEBAR_DEFAULT), saveLayout())}
          ></div>
        {/if}
        {@render edgeToggle()}
      </div>
    {:else}
      {@render edgeToggle()}
    {/if}

    {#if q}
      {#key q.id}
        <QuestionEditor bind:q={app.quiz.questions[index]} {index} />
      {/key}
    {:else}
      <div class="welcome">
        <div class="hero">
          <h1>Build Moodle questions, right in your browser</h1>
          <p>Create, edit and reorder questions, then export them to Moodle XML, GIFT or Aiken. Import existing files — or drop one onto this window — to keep working on them.</p>
          <div class="cta">
            <button class="btn btn-primary" onclick={() => openModal('add')}><Plus size={16} /> Add a question</button>
            <button class="btn" onclick={() => openModal('import')}><Upload size={16} /> Import questions</button>
          </div>
        </div>
        {#if otherQuizzes.length}
          <div class="quick">
            <h2>Or continue another quiz</h2>
            <div class="grid">
              {#each otherQuizzes.slice(0, 6) as other (other.id)}
                <button class="tile" onclick={() => switchQuiz(other.id)}>
                  <span class="icon"><FileText size={18} /></span>
                  <span class="tile-text">
                    <span class="tile-name">{other.name}</span>
                    <span class="tile-meta">{other.count} question{other.count === 1 ? '' : 's'}</span>
                  </span>
                </button>
              {/each}
            </div>
            {#if otherQuizzes.length > 6}
              <button class="btn btn-ghost btn-sm more" onclick={() => openModal('quizzes')}>All quizzes ({library.quizzes.length})…</button>
            {/if}
          </div>
        {/if}
        <div class="quick">
          <h2>Quick start</h2>
          <div class="grid">
            {#each QUESTION_TYPES as t}
              {@const Icon = TYPE_ICONS[t.type]}
              <button class="tile" onclick={() => addQuestion(t.type)}>
                <span class="icon"><Icon size={18} /></span>
                <span>{t.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if app.modal === 'add'}
  <AddQuestionDialog />
{:else if app.modal === 'import'}
  <ImportDialog />
{:else if app.modal === 'export'}
  <ExportDialog />
{:else if app.modal === 'settings'}
  <SettingsDialog />
{:else if app.modal === 'help'}
  <HelpDialog />
{:else if app.modal === 'bulk'}
  <BulkEditDialog />
{:else if app.modal === 'quiz-preview'}
  <QuizPreviewDialog />
{:else if app.modal === 'print'}
  <PrintDialog />
{:else if app.modal === 'find'}
  <FindReplaceDialog />
{:else if app.modal === 'quizzes'}
  <QuizzesDialog />
{:else if app.modal === 'copy-to'}
  <CopyToQuizDialog />
{/if}

{#if app.confirm}
  <ConfirmDialog confirm={app.confirm} />
{/if}

<Toasts />

<!-- Small tab on the list's right edge (or the window's left edge when hidden) that shows or hides the question list. -->
{#snippet edgeToggle()}
  <button
    class="edge-toggle"
    class:closed={!app.sidebarOpen}
    title={app.sidebarOpen ? 'Hide question list' : 'Show question list'}
    aria-label={app.sidebarOpen ? 'Hide question list' : 'Show question list'}
    aria-expanded={app.sidebarOpen}
    onclick={() => (app.sidebarOpen = !app.sidebarOpen)}
  >
    {#if app.sidebarOpen}<ChevronLeft size={14} />{:else}<ChevronRight size={14} />{/if}
  </button>
{/snippet}

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .main {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
  }
  .side {
    display: flex;
    min-height: 0;
    position: relative;
    z-index: 6;
  }
  .side.resizing {
    cursor: col-resize;
    user-select: none;
  }
  .resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -4px;
    width: 8px;
    cursor: col-resize;
    outline: none;
  }
  .resizer::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    transition: background 0.12s;
  }
  .resizer:hover::after,
  .resizer:focus-visible::after,
  .resizing .resizer::after {
    background: var(--accent);
  }
  .edge-toggle {
    position: absolute;
    top: 50%;
    right: -12px;
    z-index: 2;
    width: 22px;
    height: 44px;
    margin-top: -22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-3);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08));
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .edge-toggle:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  .edge-toggle:focus-visible {
    box-shadow: var(--focus);
  }
  /* With the list hidden, the tab hugs the window's left edge. */
  .edge-toggle.closed {
    right: auto;
    left: 0;
    width: 16px;
    border-left: none;
    border-radius: 0 999px 999px 0;
    z-index: 6;
  }
  .side.overlay {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    box-shadow: var(--shadow-lg);
    max-width: 88vw;
  }
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 19;
    border: none;
    background: rgba(10, 14, 22, 0.4);
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(10, 14, 22, 0.45);
    pointer-events: none;
  }
  .drop-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: min(520px, 100%);
    padding: 40px 24px;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text-2);
    text-align: center;
    box-shadow: var(--shadow-lg);
  }
  .drop-card :global(svg) {
    color: var(--accent);
  }
  .drop-card strong {
    font-size: 16px;
    color: var(--text);
  }
  .drop-card span {
    font-size: 13px;
  }
  .welcome {
    flex: 1;
    overflow: auto;
    padding: 56px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
  }
  .hero {
    max-width: 640px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .hero h1 {
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .hero p {
    color: var(--text-2);
    font-size: 15px;
  }
  .cta {
    display: flex;
    gap: 10px;
    margin-top: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .cta .btn {
    height: 40px;
    padding: 0 18px;
  }
  .quick {
    width: 100%;
    max-width: 760px;
  }
  .quick h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    margin-bottom: 12px;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-weight: 500;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .tile:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .tile-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tile-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile-meta {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
  }
  .more {
    display: flex;
    margin: 10px auto 0;
  }
  .icon {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-3);
    color: var(--accent);
  }
  @media (max-width: 600px) {
    .welcome {
      padding: 32px 16px;
    }
    .hero h1 {
      font-size: 22px;
    }
  }
</style>
