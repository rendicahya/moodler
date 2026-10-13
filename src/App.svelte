<script>
  import { Plus, Upload } from '@lucide/svelte';
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
  import { app, initPersistence, undo, redo, openModal, selectedQuestion, selectedIndex, addQuestion, togglePreview } from './lib/store.svelte.js';
  import { QUESTION_TYPES } from './lib/model.js';
  import { TYPE_ICONS } from './lib/icons.js';

  initPersistence();

  const q = $derived(selectedQuestion());
  const index = $derived(selectedIndex());

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

  function isTyping(e) {
    const t = e.target;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  function onkeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
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
    } else if (e.altKey && key === 'n') {
      e.preventDefault();
      openModal('add');
    } else if (e.altKey && key === 'p' && q) {
      e.preventDefault();
      togglePreview();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  <Header />
  <div class="main">
    {#if app.sidebarOpen}
      {#if narrow}
        <button class="scrim" aria-label="Close question list" onclick={() => (app.sidebarOpen = false)}></button>
      {/if}
      <div class="side" class:overlay={narrow}>
        <Sidebar />
      </div>
    {/if}

    {#if q}
      {#key q.id}
        <QuestionEditor bind:q={app.quiz.questions[index]} {index} />
      {/key}
    {:else}
      <div class="welcome">
        <div class="hero">
          <h1>Build Moodle questions, right in your browser</h1>
          <p>Create, edit and reorder questions, then export them to Moodle XML, GIFT or Aiken. Import existing files to keep working on them.</p>
          <div class="cta">
            <button class="btn btn-primary" onclick={() => openModal('add')}><Plus size={16} /> Add a question</button>
            <button class="btn" onclick={() => openModal('import')}><Upload size={16} /> Import questions</button>
          </div>
        </div>
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
{/if}

{#if app.confirm}
  <ConfirmDialog confirm={app.confirm} />
{/if}

<Toasts />

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
