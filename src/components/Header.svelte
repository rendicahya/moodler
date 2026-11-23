<script>
  import { onMount } from 'svelte';
  import { Sun, Moon, Maximize, Minimize, Undo2, Redo2, Upload, Download, FilePlus, Settings, CircleQuestionMark, Presentation, Printer, Sparkles, ListChecks, Cloud, CloudUpload, CloudCheck, RefreshCw, EllipsisVertical, HardDriveDownload } from '@lucide/svelte';
  import QuizTabs from './QuizTabs.svelte';
  import ContextMenu from './ui/ContextMenu.svelte';
  import { app, library, history, backup, REMIND_AFTER, undo, redo, toggleTheme, openModal, newQuiz, downloadBackup } from '../lib/store.svelte.js';
  import { sync, editedSinceUpload, autoBlocked, uploadChanges } from '../lib/cloudsync.svelte.js';
  import { appUpdate, applyUpdate } from '../lib/pwa.svelte.js';

  const entry = $derived(library.quizzes.find((q) => q.id === library.activeId));
  // A quiz in the cloud has a Save button. Its changes also upload by themselves a few seconds after editing stops.
  const inCloud = $derived(!!entry?.cloudVersion);
  const unsaved = $derived(editedSinceUpload(entry));
  const needsHand = $derived(unsaved && (!!sync.error || autoBlocked(entry)));
  const saveText = $derived(sync.busy ? (sync.total > 1 ? `Saving ${sync.done} / ${sync.total}…` : 'Saving…') : unsaved ? 'Save' : 'Saved');
  const saveTitle = $derived(
    sync.busy
      ? 'Saving to the cloud…'
      : !unsaved
        ? 'All changes are saved to the cloud'
        : sync.error
          ? `Automatic upload failed: ${sync.error}\nSave the changes to the cloud now (Ctrl+S)`
          : needsHand
            ? 'This quiz has changed since it was last saved to the cloud. Save the changes now (Ctrl+S)'
            : 'Save the changes to the cloud now (Ctrl+S). They are also saved automatically a few seconds after you stop editing.'
  );

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

  // The "More" menu, right-aligned under its button.
  let more = $state(null);
  function openMore(e) {
    if (more) return void (more = null);
    const r = e.currentTarget.getBoundingClientRect();
    more = { x: r.right - 230, y: r.bottom + 4 };
  }
  const empty = $derived(!app.quiz.questions.length);
  const moreItems = $derived([
    { label: 'New quiz', icon: FilePlus, hint: 'Alt+Shift+N', run: newQuiz },
    { label: 'Quiz settings…', icon: Settings, hint: 'Ctrl+,', run: () => openModal('settings') },
    { label: 'Print or save as PDF…', icon: Printer, hint: 'Ctrl+P', disabled: empty, run: () => openModal('print') },
    { label: 'Download a backup', icon: HardDriveDownload, disabled: empty, run: downloadBackup },
    '-',
    { label: app.theme === 'dark' ? 'Light mode' : 'Dark mode', icon: app.theme === 'dark' ? Sun : Moon, run: toggleTheme },
    canFullscreen && { label: fullscreen ? 'Exit full screen' : 'Full screen', icon: fullscreen ? Minimize : Maximize, run: toggleFullscreen },
    '-',
    { label: 'Help & shortcuts', icon: CircleQuestionMark, run: () => openModal('help') },
  ].filter(Boolean));

  // The save status is plain text, except when a backup is due or saving failed: then it becomes a backup button.
  const backupDue = $derived(app.quiz.questions.length > 0 && backup.edits >= REMIND_AFTER);
  const status = $derived(history.saveFailed ? 'error' : history.pending ? 'saving' : backupDue ? 'due' : 'saved');
  const actionable = $derived(status === 'error' || status === 'due');
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
      actionable && 'Click to download a backup file (.json).',
    ]
      .filter(Boolean)
      .join('\n')
  );
</script>

<header class="header">
  <div class="left">
    <div class="brand">
      <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 11.5h10M9 16h14M9 20.5h8" stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="23" cy="11.5" r="2" fill="var(--on-accent)" />
      </svg>
      <span class="app-name">Moodler</span>
    </div>
  </div>

  <QuizTabs />

  <div class="right">
    {#if appUpdate.ready}
      <button class="btn btn-sm update" title="A new version of Moodler is available. Click to reload into it; your work is saved." onclick={applyUpdate}>
        <RefreshCw size={14} /><span>Update</span>
      </button>
    {/if}
    {#if actionable}
      <button class="btn btn-ghost btn-sm status {status}" title={statusTitle} aria-label="{STATUS_TEXT[status]}. Download a backup" onclick={downloadBackup}>
        <span class="dot"></span><span class="status-text">{STATUS_TEXT[status]}</span>
      </button>
    {:else}
      <span class="btn btn-sm status static {status}" title={statusTitle} role="status">
        <span class="dot"></span><span class="status-text">{STATUS_TEXT[status]}</span>
      </span>
    {/if}
    <div class="group">
      <button class="btn btn-ghost btn-icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onclick={undo}><Undo2 size={17} /></button>
      <button class="btn btn-ghost btn-icon" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onclick={redo}><Redo2 size={17} /></button>
    </div>
    <span class="divider"></span>
    <!-- Getting questions in and out -->
    <button class="btn btn-ghost" title="Import questions (Ctrl+O)" onclick={() => openModal('import')}><Download size={16} /><span class="btn-text">Import</span></button>
    <button class="btn btn-ghost" title={entry?.cloudVersion ? 'Export questions' : 'Export questions (Ctrl+S)'} onclick={() => openModal('export')}><Upload size={16} /><span class="btn-text">Export</span></button>
    <span class="divider"></span>
    <!-- Looking over the quiz -->
    <button class="btn btn-ghost" title="Preview the whole quiz (Alt+Q)" disabled={!app.quiz.questions.length} onclick={() => openModal('quiz-preview')}>
      <Presentation size={16} /><span class="btn-text">Preview</span>
    </button>
    <button class="btn btn-ghost hide-xs" title="Check questions: review progress, answer key and repeated questions (Alt+C)" disabled={!app.quiz.questions.length} onclick={() => openModal('check')}><ListChecks size={16} /><span class="btn-text">Check</span></button>
    <button class="btn btn-soft hide-xs" title="Generate questions with AI: write a prompt for an AI chatbot (Alt+G)" aria-label="Generate questions with AI" onclick={() => openModal('ai-prompt')}><Sparkles size={16} /><span class="btn-text">AI</span></button>
    <span class="divider"></span>
    <!-- Cloud, with the Save button of a quiz that is in the cloud after it -->
    <button class="btn btn-soft hide-xs" title="Cloud: keep your quizzes in your private cloud folders and open them on any device" aria-label="Cloud" onclick={() => openModal('cloud')}><Cloud size={16} /><span class="btn-text">Cloud</span></button>
    {#if inCloud || sync.busy}
      <button
        class="btn btn-sm cloud-sync"
        class:unsaved={unsaved && !sync.busy}
        class:warn={needsHand && !sync.busy}
        title={saveTitle}
        aria-label={saveText === 'Save' ? 'Save to the cloud' : saveText}
        disabled={sync.busy || !unsaved}
        onclick={uploadChanges}>{#if unsaved || sync.busy}<CloudUpload size={16} />{:else}<CloudCheck size={16} />{/if}<span class="sync-text">{saveText}</span></button
      >
    {/if}
    <span class="divider"></span>
    <!-- Everything used less often -->
    <button
      class="btn btn-ghost btn-icon"
      title="More: new quiz, settings, print, help, dark mode"
      aria-label="More"
      aria-haspopup="menu"
      aria-expanded={!!more}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={openMore}><EllipsisVertical size={18} /></button
    >
  </div>
</header>

{#if more}
  <ContextMenu x={more.x} y={more.y} items={moreItems} onclose={() => (more = null)} />
{/if}

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
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
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
  .app-name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .group {
    display: flex;
  }
  .status {
    gap: 6px;
    color: var(--text-3);
    font-weight: 500;
  }
  .status.static {
    cursor: default;
    border-color: transparent;
    background: none;
    box-shadow: none;
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
  .update {
    gap: 6px;
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .cloud-sync {
    gap: 6px;
    font-weight: 500;
  }
  .cloud-sync:disabled {
    opacity: 1;
    color: var(--text-3);
    cursor: default;
  }
  .cloud-sync.unsaved {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .cloud-sync.warn {
    border-color: color-mix(in srgb, var(--warning) 50%, transparent);
    color: var(--warning);
  }
  .divider {
    width: 1px;
    height: 22px;
    background: var(--border);
    margin: 0 4px;
  }
  @media (max-width: 1240px) {
    .status:not(.due):not(.error) .status-text,
    .sync-text {
      display: none;
    }
    .cloud-sync {
      width: 34px;
      padding: 0;
      justify-content: center;
    }
  }
  /* Below this, the plain buttons show only their icon so everything fits; AI and Cloud keep their label longer. */
  @media (max-width: 1060px) {
    .btn-ghost .btn-text {
      display: none;
    }
    .btn-ghost:has(.btn-text) {
      width: 34px;
      padding: 0;
    }
  }
  /* Leave the room to the quiz tabs. */
  @media (max-width: 1100px) {
    .app-name {
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
  }
  @media (max-width: 560px) {
    .app-name,
    .divider,
    .hide-xs {
      display: none;
    }
    .right {
      gap: 2px;
    }
  }
</style>
