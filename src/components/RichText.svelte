<script>
  import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Subscript,
    Superscript,
    List,
    ListOrdered,
    Link,
    Image,
    Sigma,
    RemoveFormatting,
    CodeXml,
    Check,
    X,
  } from '@lucide/svelte';
  import { sanitizeHtml } from '../lib/sanitize.js';
  import { notify } from '../lib/store.svelte.js';
  import { rememberCaret } from '../lib/caret.js';
  import { imageForEditor, sizeText } from '../lib/images.js';

  let { value = $bindable(''), placeholder = '', compact = false, minHeight = compact ? 38 : 120, id, label = 'Rich text editor' } = $props();

  let el = $state();
  let fileInput;
  let source = $state(false);
  let focused = $state(false);
  let active = $state({});
  let linkOpen = $state(false);
  let linkUrl = $state('https://');
  let savedRange = null;

  const normalize = (html) => {
    const t = html.trim();
    return t === '<br>' || t === '<p><br></p>' || t === '<div><br></div>' ? '' : html;
  };

  $effect(() => {
    const v = value ?? '';
    if (!el || source) return;
    if (normalize(el.innerHTML) !== v) el.innerHTML = sanitizeHtml(v);
  });

  function sync() {
    value = normalize(el.innerHTML);
  }

  const COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript', 'insertUnorderedList', 'insertOrderedList'];

  function refreshState() {
    if (!focused) return;
    if (el) rememberCaret(el);
    const s = {};
    for (const c of COMMANDS) {
      try {
        s[c] = document.queryCommandState(c);
      } catch {
        s[c] = false;
      }
    }
    active = s;
  }

  function exec(cmd, arg = null) {
    el.focus();
    document.execCommand(cmd, false, arg);
    sync();
    refreshState();
  }

  function saveSelection() {
    const sel = getSelection();
    savedRange = sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  }

  function restoreSelection() {
    el.focus();
    if (savedRange) {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function openLink() {
    saveSelection();
    const a = getSelection().anchorNode?.parentElement?.closest('a');
    linkUrl = a?.getAttribute('href') || 'https://';
    linkOpen = true;
  }

  function applyLink() {
    restoreSelection();
    if (linkUrl && linkUrl !== 'https://') {
      if (savedRange && savedRange.collapsed) {
        exec('insertHTML', `<a href="${linkUrl.replace(/"/g, '&quot;')}">${linkUrl.replace(/</g, '&lt;')}</a>`);
      } else exec('createLink', linkUrl);
    } else exec('unlink');
    linkOpen = false;
  }

  async function insertImages(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      let image;
      try {
        image = await imageForEditor(f);
      } catch {
        notify(`Could not read the image “${f.name}”.`, 'error');
        continue;
      }
      exec('insertHTML', `<img src="${image.url}" alt="${f.name.replace(/[<>"&]/g, '')}">`);
      if (image.original) {
        const { url, original } = image;
        // Puts the full-size image back, wherever it is in the text by now.
        const useOriginal = () => {
          if (value.includes(url)) value = value.replace(url, () => original);
        };
        notify(`Image made smaller: ${sizeText(image.before)} → ${sizeText(image.after)}.`, 'info', 6000, { label: 'Use original', run: useOriginal });
      } else if (f.size > 2 * 1024 * 1024) notify('Large images make exported files big. Consider resizing images before inserting.', 'warning', 6000);
    }
  }

  function onpaste(e) {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      insertImages(files);
    }
  }

  function ondrop(e) {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      insertImages(files);
    }
  }

  function onfocus() {
    focused = true;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* not supported */
    }
    refreshState();
  }

  function onblur(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      focused = false;
      linkOpen = false;
    }
  }

  function toggleSource() {
    if (!source) sync();
    source = !source;
  }

  // ---------------------------------------------------------------- the small toolbar over selected text

  // Where it shows, in viewport pixels ({ x, y, below }), or null when hidden.
  let bubble = $state(null);
  let probe = $state(null);
  const BUBBLE_TOOLS = [
    { cmd: 'bold', icon: Bold, title: 'Bold (Ctrl+B)' },
    { cmd: 'italic', icon: Italic, title: 'Italic (Ctrl+I)' },
    { cmd: 'underline', icon: Underline, title: 'Underline (Ctrl+U)' },
    { cmd: 'strikeThrough', icon: Strikethrough, title: 'Strikethrough' },
    { cmd: 'removeFormat', icon: RemoveFormatting, title: 'Clear formatting' },
  ];

  /** The selected range inside this editor, or null when nothing in it is selected. */
  function selectedRange() {
    const sel = getSelection();
    if (!el || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    return el.contains(range.commonAncestorContainer) && sel.toString().trim() ? range : null;
  }

  function placeBubble() {
    const range = selectedRange();
    if (!range) return void (bubble = null);
    const r = range.getBoundingClientRect();
    if (!r.width && !r.height) return void (bubble = null);
    const x = Math.min(Math.max(r.left + r.width / 2, 110), window.innerWidth - 110);
    // Above the selection, or below it when there's no room at the top.
    const below = r.top < 56;
    // Inside a dialog, whose backdrop filter makes it the frame of fixed elements, the origin isn't the window's.
    const o = probe?.getBoundingClientRect() ?? { left: 0, top: 0 };
    bubble = { x: x - o.left, y: (below ? r.bottom + 8 : r.top - 8) - o.top, below };
  }

  // Shown when the mouse button is released over a selection; it waits a moment so that the selection is final.
  function onpointerup(e) {
    if (e.button !== 0) return;
    setTimeout(placeBubble, 0);
  }

  function bubbleExec(cmd) {
    exec(cmd);
    placeBubble();
  }

  function onselection() {
    refreshState();
    if (bubble && !selectedRange()) bubble = null;
  }

  // Scrolling or resizing would leave it behind, so it goes until the next selection.
  $effect(() => {
    if (!bubble) return;
    const hide = () => (bubble = null);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  });

  const tools = [
    { cmd: 'bold', icon: Bold, title: 'Bold (Ctrl+B)' },
    { cmd: 'italic', icon: Italic, title: 'Italic (Ctrl+I)' },
    { cmd: 'underline', icon: Underline, title: 'Underline (Ctrl+U)' },
    { cmd: 'strikeThrough', icon: Strikethrough, title: 'Strikethrough' },
    null,
    { cmd: 'subscript', icon: Subscript, title: 'Subscript' },
    { cmd: 'superscript', icon: Superscript, title: 'Superscript' },
    null,
    { cmd: 'insertUnorderedList', icon: List, title: 'Bulleted list' },
    { cmd: 'insertOrderedList', icon: ListOrdered, title: 'Numbered list' },
  ];
</script>

<svelte:document onselectionchange={onselection} />

<div class="rte" class:compact class:focused class:source onfocusin={() => (focused = true)} onfocusout={onblur}>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    {#each tools as t}
      {#if t}
        <button
          type="button"
          class="tb"
          class:on={active[t.cmd]}
          title={t.title}
          aria-label={t.title}
          disabled={source}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => exec(t.cmd)}><t.icon size={15} /></button
        >
      {:else}
        <span class="sep"></span>
      {/if}
    {/each}
    <span class="sep"></span>
    <button type="button" class="tb" title="Link" aria-label="Link" disabled={source} onmousedown={(e) => e.preventDefault()} onclick={openLink}><Link size={15} /></button>
    <button type="button" class="tb" title="Insert image" aria-label="Insert image" disabled={source} onmousedown={(e) => e.preventDefault()} onclick={() => fileInput.click()}><Image size={15} /></button>
    <button
      type="button"
      class="tb"
      title="Insert TeX equation \( … \)"
      aria-label="Insert equation"
      disabled={source}
      onmousedown={(e) => e.preventDefault()}
      onclick={() => exec('insertText', '\\( x^2 \\)')}><Sigma size={15} /></button
    >
    <button type="button" class="tb" title="Clear formatting" aria-label="Clear formatting" disabled={source} onmousedown={(e) => e.preventDefault()} onclick={() => exec('removeFormat')}
      ><RemoveFormatting size={15} /></button
    >
    <span class="spacer"></span>
    <button type="button" class="tb" class:on={source} title="Edit HTML source" aria-label="Edit HTML source" onclick={toggleSource}><CodeXml size={15} /></button>
    <input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={(e) => (insertImages([...e.currentTarget.files]), (e.currentTarget.value = ''))} />
  </div>

  {#if linkOpen}
    <div class="linkbar">
      <input
        class="input input-sm"
        bind:value={linkUrl}
        placeholder="https://example.com"
        {@attach (node) => node.focus()}
        onkeydown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), applyLink());
          if (e.key === 'Escape') (e.stopPropagation(), (linkOpen = false));
        }}
      />
      <button type="button" class="btn btn-sm btn-primary" onclick={applyLink}><Check size={14} /> Apply</button>
      <button type="button" class="btn btn-sm btn-ghost btn-icon" aria-label="Cancel" onclick={() => (linkOpen = false)}><X size={14} /></button>
    </div>
  {/if}

  {#if source}
    <textarea class="src" {id} bind:value style:min-height="{Math.max(minHeight, 80)}px" spellcheck="false" aria-label="{label} (HTML source)"></textarea>
  {:else}
    <div
      bind:this={el}
      {id}
      class="editable rendered"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      tabindex="0"
      data-placeholder={placeholder}
      style:min-height="{minHeight}px"
      oninput={sync}
      {onfocus}
      {onpaste}
      {ondrop}
      onkeyup={refreshState}
      onpointerdown={() => (bubble = null)}
      {onpointerup}
      onkeydown={(e) => e.key === 'Escape' && bubble && (e.stopPropagation(), (bubble = null))}
    ></div>
  {/if}

  <span class="probe" aria-hidden="true" bind:this={probe}></span>
  {#if bubble && focused && !source}
    <div class="bubble" class:below={bubble.below} role="toolbar" aria-label="Format the selected text" style:left="{bubble.x}px" style:top="{bubble.y}px">
      {#each BUBBLE_TOOLS as t (t.cmd)}
        <button
          type="button"
          class="tb"
          class:on={active[t.cmd]}
          title={t.title}
          aria-label={t.title}
          tabindex="-1"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => bubbleExec(t.cmd)}><t.icon size={15} /></button
        >
        {#if t.cmd === 'strikeThrough'}<span class="sep"></span>{/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .rte {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    transition: border-color 0.12s, box-shadow 0.12s;
    min-width: 0;
  }
  .rte:hover {
    border-color: var(--border-strong);
  }
  .rte.focused {
    border-color: var(--accent);
    box-shadow: var(--focus);
  }
  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1px;
    padding: 4px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .compact .toolbar {
    display: none;
  }
  .compact.focused .toolbar,
  .compact.source .toolbar {
    display: flex;
  }
  .tb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    border: none;
    background: none;
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
  }
  .tb:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .tb.on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .tb:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--border);
  }
  .spacer {
    flex: 1;
  }
  .bubble {
    position: fixed;
    z-index: 150;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 3px;
    transform: translate(-50%, -100%);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.15));
    animation: bubble-in 0.1s ease-out;
  }
  .probe {
    position: fixed;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .bubble.below {
    transform: translate(-50%, 0);
  }
  @keyframes bubble-in {
    from {
      opacity: 0;
    }
  }
  .linkbar {
    display: flex;
    gap: 6px;
    padding: 6px;
    border-bottom: 1px solid var(--border);
  }
  .editable {
    padding: 8px 11px;
    outline: none;
    overflow-wrap: anywhere;
    max-height: 520px;
    overflow: auto;
  }
  .editable:empty::before {
    content: attr(data-placeholder);
    color: var(--text-3);
    pointer-events: none;
  }
  .editable :global(img) {
    max-width: 100%;
  }
  .editable :global(ul),
  .editable :global(ol) {
    margin: 0.3em 0;
    padding-left: 1.6em;
  }
  .src {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    padding: 8px 11px;
    font-family: var(--mono);
    font-size: 12.5px;
    resize: vertical;
    outline: none;
  }
</style>
