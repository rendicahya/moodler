<script>
  import { onMount } from 'svelte';
  import { Sun, Moon, Maximize, Minimize, Undo2, Redo2, Upload, Download, FilePlus, Settings, PanelLeft, CircleQuestionMark, Presentation } from '@lucide/svelte';
  import { app, history, backup, REMIND_AFTER, undo, redo, toggleTheme, openModal, newQuiz, downloadBackup } from '../lib/store.svelte.js';

  let fullscreen = $state(false);
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  onMount(() => {
    const update = () => (fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  const total = $derived(app.quiz.questions.reduce((s, q) => s + (Number(q.defaultgrade) || 0), 0));

  // Save status doubles as a one-click backup button.
  const backupDue = $derived(app.quiz.questions.length > 0 && backup.edits >= REMIND_AFTER);
  const status = $derived(history.saveFailed ? 'error' : history.pending ? 'saving' : backupDue ? 'due' : 'saved');
  const STATUS_TEXT = { error: 'Not saved', saving: 'Saving…', due: 'Back up', saved: 'Saved' };
  const when = (d) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const statusTitle = $derived(
    [
      history.saveFailed
        ? 'Could not save to browser storage.'
        : history.savedAt
          ? `Saved in this browser at ${history.savedAt.toLocaleTimeString(undefined, { timeStyle: 'short' })}.`
          : 'Changes are saved automatically in this browser.',
      backup.at
        ? `Last backup: ${when(backup.at)} (${backup.edits} change${backup.edits === 1 ? '' : 's'} since).`
        : 'Never backed up.',
      'Click to download a backup file (.json).',
    ].join('\n')
  );
</script>

<header class="header">
  <div class="left">
    <button class="btn btn-ghost btn-icon sidebar-toggle" title="Toggle question list" aria-label="Toggle question list" onclick={() => (app.sidebarOpen = !app.sidebarOpen)}>
      <PanelLeft size={18} />
    </button>
    <div class="brand">
      <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 11.5h10M9 16h14M9 20.5h8" stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="23" cy="11.5" r="2" fill="var(--on-accent)" />
      </svg>
      <div class="titles">
        <span class="app-name">Moodler</span>
        <button class="quiz-name" title="Quiz settings" onclick={() => openModal('settings')}>
          {app.quiz.name || 'Untitled quiz'}
          <span class="meta">· {app.quiz.questions.length} question{app.quiz.questions.length === 1 ? '' : 's'} · {Math.round(total * 100) / 100} marks</span>
        </button>
      </div>
    </div>
  </div>

  <div class="right">
    <button class="btn btn-ghost btn-sm status {status}" title={statusTitle} aria-label="{STATUS_TEXT[status]}. Download a backup" onclick={downloadBackup}>
      <span class="dot"></span><span class="status-text">{STATUS_TEXT[status]}</span>
    </button>
    <div class="group">
      <button class="btn btn-ghost btn-icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onclick={undo}><Undo2 size={17} /></button>
      <button class="btn btn-ghost btn-icon" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onclick={redo}><Redo2 size={17} /></button>
    </div>
    <span class="divider"></span>
    <button class="btn btn-ghost hide-sm" title="New quiz" onclick={newQuiz}><FilePlus size={16} /><span class="btn-text">New</span></button>
    <button class="btn btn-ghost" title="Quiz settings" onclick={() => openModal('settings')}><Settings size={16} /><span class="btn-text">Settings</span></button>
    <button class="btn btn-ghost" title="Preview the whole quiz (Alt+Q)" disabled={!app.quiz.questions.length} onclick={() => openModal('quiz-preview')}>
      <Presentation size={16} /><span class="btn-text">Preview</span>
    </button>
    <button class="btn" title="Import questions (Ctrl+O)" onclick={() => openModal('import')}><Download size={16} /><span class="btn-text">Import</span></button>
    <button class="btn btn-primary" title="Export questions (Ctrl+S)" onclick={() => openModal('export')}><Upload size={16} /><span class="btn-text">Export</span></button>
    <span class="divider"></span>
    <button class="btn btn-ghost btn-icon" title="Help & shortcuts" aria-label="Help" onclick={() => openModal('help')}><CircleQuestionMark size={17} /></button>
    <button
      class="btn btn-ghost btn-icon"
      title={app.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
      onclick={toggleTheme}
    >
      {#if app.theme === 'dark'}<Sun size={17} />{:else}<Moon size={17} />{/if}
    </button>
    {#if canFullscreen}
      <button class="btn btn-ghost btn-icon" title={fullscreen ? 'Exit full screen' : 'Full screen'} aria-label="Toggle full screen" onclick={toggleFullscreen}>
        {#if fullscreen}<Minimize size={17} />{:else}<Maximize size={17} />{/if}
      </button>
    {/if}
  </div>
</header>

<style>
  .header {
    height: var(--header-h);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px 0 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 10;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .logo {
    width: 30px;
    height: 30px;
    flex: none;
  }
  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.2;
  }
  .app-name {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .quiz-name {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    font-weight: 600;
    font-size: 14.5px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
  }
  .quiz-name:hover {
    color: var(--accent);
  }
  .meta {
    font-weight: 400;
    color: var(--text-3);
    font-size: 13px;
  }
  .group {
    display: flex;
  }
  .status {
    gap: 6px;
    color: var(--text-3);
    font-weight: 500;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    flex: none;
  }
  .status.saving .dot {
    background: var(--text-3);
  }
  .status.due {
    color: var(--warning);
  }
  .status.due .dot {
    background: var(--warning);
  }
  .status.error {
    color: var(--danger);
  }
  .status.error .dot {
    background: var(--danger);
  }
  .divider {
    width: 1px;
    height: 22px;
    background: var(--border);
    margin: 0 4px;
  }
  @media (max-width: 1100px) {
    .meta {
      display: none;
    }
  }
  @media (max-width: 1240px) {
    .status:not(.due):not(.error) .status-text {
      display: none;
    }
  }
  @media (max-width: 860px) {
    .btn-text {
      display: none;
    }
    .btn:has(.btn-text) {
      width: 34px;
      padding: 0;
    }
    .hide-sm {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .app-name,
    .divider {
      display: none;
    }
    .right {
      gap: 2px;
    }
  }
</style>
