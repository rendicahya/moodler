<script>
  import { tick } from 'svelte';
  import { Flag, Eye, EyeOff, Dices, Bold, Italic, Underline, Strikethrough, Code, RemoveFormatting, CaseSensitive } from '@lucide/svelte';
  import { TYPE_MAP, escapeHtml, round, stripHtml } from '../lib/model.js';
  import { CASES, changeCaseInRange, rangeOffsets, offsetsRange, selectOffsets } from '../lib/textcase.js';
  import { mirror, setMirror, clearMirror, showMirror, hideMirror } from '../lib/selmirror.svelte.js';
  import { parseCloze, CLOZE_RE, isChoiceCloze, canonicalClozeType } from '../lib/formats/cloze.js';
  import { sanitizeHtml } from '../lib/sanitize.js';
  import { substitute, itemValues, tryEvaluate, formatAnswer, toleranceText } from '../lib/calc.js';
  import { app } from '../lib/store.svelte.js';

  // `showAnswers` lets a parent control the answer reveal (the whole-quiz preview); without it the pane has its own toggle,
  // which stays on when moving to another question.
  let { q, index, showAnswers = null } = $props();
  const reveal = $derived(showAnswers ?? app.revealAnswers);

  const toHtml = (text, format = 'html') => (format === 'html' ? sanitizeHtml(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>'));
  // The value set shown for a calculated question.
  let valueSet = $state(0);
  const set = $derived(Math.min(valueSet, Math.max(0, (q.itemcount || 1) - 1)));

  const mark = $derived(q.type === 'cloze' ? parseCloze(q.questiontext).reduce((s, g) => s + g.weight, 0) : Number(q.defaultgrade));

  function numberLabel(i, style) {
    switch (style) {
      case 'ABCD':
        return String.fromCharCode(65 + i) + '.';
      case '123':
        return i + 1 + '.';
      case 'iii':
        return ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i] + '.';
      case 'IIII':
        return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] + '.';
      case 'none':
        return '';
      default:
        return String.fromCharCode(97 + i) + '.';
    }
  }

  // Replaces Cloze gaps with form controls.
  function clozeHtml(html, show) {
    let n = 0;
    return toHtml(html).replace(CLOZE_RE, (raw) => {
      const g = parseCloze(raw)[0];
      if (!g) return raw;
      n++;
      const type = canonicalClozeType(g.type);
      const best = g.answers.reduce((b, a) => (a.fraction > (b?.fraction ?? -Infinity) ? a : b), null);
      if (isChoiceCloze(type)) {
        if (type.startsWith('MULTICHOICE') && !type.startsWith('MULTICHOICE_V') && !type.startsWith('MULTICHOICE_H')) {
          const opts = g.answers.map((a) => `<option ${show && a === best ? 'selected' : ''}>${escapeHtml(stripHtml(a.text))}</option>`).join('');
          return `<select class="p-select${show ? ' ok' : ''}" aria-label="Gap ${n}"><option></option>${opts}</select>`;
        }
        const multi = type.startsWith('MULTIRESPONSE');
        const horiz = /_H/.test(type);
        const items = g.answers
          .map(
            (a) =>
              `<label class="p-opt"><input type="${multi ? 'checkbox' : 'radio'}" name="g${q.id}-${n}" ${show && a.fraction > 0 && (multi || a === best) ? 'checked' : ''}> ${escapeHtml(stripHtml(a.text))}</label>`
          )
          .join('');
        return `<span class="p-group ${horiz ? 'h' : 'v'}">${items}</span>`;
      }
      const width = Math.max(6, ...g.answers.map((a) => String(a.text).length)) + 2;
      return `<input class="p-input${show ? ' ok' : ''}" size="${width}" aria-label="Gap ${n}" value="${show && best ? escapeHtml(stripHtml(best.text)) : ''}">`;
    });
  }

  // ---------------------------------------------------------------- formatting selected text in the preview

  // Text shown just as it is stored can be formatted from the preview pane (not the whole-quiz preview).
  const formattable = $derived(showAnswers === null);
  const plainText = $derived(formattable && !['cloze', 'gapselect', 'ddwtos', 'calculated'].includes(q.type) && (q.questiontextformat ?? 'html') === 'html');
  const editKey = (key) => (formattable ? key : undefined);

  let wrapEl = $state();
  let probe = $state();
  // Where the toolbar shows, in viewport pixels ({ x, y, below, on }), or null when hidden.
  let bubble = $state(null);
  const BUBBLE_TOOLS = [
    { cmd: 'bold', icon: Bold, title: 'Bold', tags: 'b, strong' },
    { cmd: 'italic', icon: Italic, title: 'Italic', tags: 'i, em' },
    { cmd: 'underline', icon: Underline, title: 'Underline', tags: 'u' },
    { cmd: 'strikeThrough', icon: Strikethrough, title: 'Strikethrough', tags: 's, strike, del' },
    { cmd: 'code', icon: Code, title: 'Code', tags: 'code' },
    { cmd: 'removeFormat', icon: RemoveFormatting, title: 'Clear formatting' },
  ];

  /** The selection and the stored text it is in, or null when no formattable text is selected. */
  function selected() {
    const sel = getSelection();
    if (!wrapEl || !sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-edit]');
    return el && wrapEl.contains(el) ? { range, el } : null;
  }

  function placeBubble() {
    const s = selected();
    if (!s) return void (bubble = null);
    const r = s.range.getBoundingClientRect();
    if (!r.width && !r.height) return void (bubble = null);
    const x = Math.min(Math.max(r.left + r.width / 2, 110), window.innerWidth - 110);
    const below = r.top < 56;
    // Inside a frame of fixed elements (such as a dialog with a backdrop filter) the origin isn't the window's.
    const o = probe?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const start = s.range.startContainer.nodeType === 1 ? s.range.startContainer : s.range.startContainer.parentElement;
    const on = Object.fromEntries(BUBBLE_TOOLS.filter((t) => t.tags).map((t) => [t.cmd, !!start.closest(t.tags) && s.el.contains(start.closest(t.tags))]));
    bubble = { x: x - o.left, y: (below ? r.bottom + 8 : r.top - 8) - o.top, below, on };
  }

  function onpointerup(e) {
    if (e.button === 0 && formattable) setTimeout(placeBubble, 0);
  }

  function textOf(key) {
    const [kind, id] = key.split(':');
    if (kind === 'questiontext' || kind === 'generalfeedback') return q[kind];
    const list = { answer: q.answers, subq: q.subquestions, item: q.items }[kind];
    return list?.find((x) => String(x.id) === id)?.text;
  }

  function storeText(key, html) {
    const [kind, id] = key.split(':');
    if (kind === 'questiontext' || kind === 'generalfeedback') return void (q[kind] = html);
    const list = { answer: q.answers, subq: q.subquestions, item: q.items }[kind];
    const it = list?.find((x) => String(x.id) === id);
    if (it) it.text = html;
  }

  const unwrap = (el) => el.replaceWith(...el.childNodes);

  // The browser has no command for code, so the selection is wrapped in <code>, or taken out of it when it is in code already.
  function toggleCode(root, range) {
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const inCode = start.closest('code');
    if (inCode && root.contains(inCode)) {
      unwrap(inCode);
      for (const c of [...root.querySelectorAll('code')]) if (range.intersectsNode(c)) unwrap(c);
      return;
    }
    const frag = range.extractContents();
    frag.querySelectorAll('code').forEach(unwrap);
    const code = document.createElement('code');
    code.append(frag);
    range.insertNode(code);
    root.querySelectorAll('code').forEach((c) => !c.textContent && c.remove());
  }

  async function format(cmd) {
    const s = selected();
    if (!s) return void (bubble = null);
    const { el, range } = s;
    const key = el.dataset.edit;
    const [start, end] = rangeOffsets(el, range);
    let newEnd = end;
    // The browser formats only editable text, so a hidden editable copy of the shown text is formatted instead.
    const copy = document.createElement('div');
    copy.contentEditable = 'true';
    copy.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;opacity:0;pointer-events:none';
    copy.innerHTML = el.innerHTML.replace(/<!---->/g, '');
    wrapEl.append(copy);
    copy.focus({ preventScroll: true });
    if (selectOffsets(copy, start, end)) {
      if (cmd === 'code') toggleCode(copy, getSelection().getRangeAt(0));
      else if (cmd.startsWith('case:')) {
        caseOpen = false;
        changeCaseInRange(copy, getSelection().getRangeAt(0), cmd.slice(5));
        newEnd = rangeOffsets(copy, getSelection().getRangeAt(0))[1];
      } else {
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(cmd);
      }
    }
    const html = copy.innerHTML.trim();
    copy.remove();
    storeText(key, html === '<br>' ? '' : html);
    await tick();
    const shown = wrapEl?.querySelector(`[data-edit="${CSS.escape(key)}"]`);
    if (shown && selectOffsets(shown, start, newEnd)) placeBubble();
    else bubble = null;
  }

  let caseOpen = $state(false);
  $effect(() => {
    if (!bubble) caseOpen = false;
  });

  function onselection() {
    const s = selected();
    if (bubble && !s) bubble = null;
    if (!formattable) return;
    if (s) {
      const [start, end] = rangeOffsets(s.el, s.range);
      setMirror('preview', s.el.dataset.edit, start, end);
    } else clearMirror('preview');
  }

  // Text selected in the editor is highlighted here.
  const me = {};
  $effect(() => {
    const on = formattable && mirror.from === 'editor' && mirror.key;
    const { key, start, end } = mirror;
    if (!on) return void hideMirror(me);
    void textOf(key), reveal;
    tick().then(() => {
      const el = wrapEl?.querySelector(`[data-edit="${CSS.escape(key)}"]`);
      const range = el && offsetsRange(el, start, end);
      if (range && mirror.from === 'editor' && mirror.key === key) showMirror(me, range);
      else hideMirror(me);
    });
    return () => hideMirror(me);
  });

  // Scrolling (of the preview), resizing or Escape put it away until the next selection.
  $effect(() => {
    if (!bubble) return;
    const hide = () => (bubble = null);
    const onscroll = (e) => (e.target === document || e.target.contains?.(wrapEl)) && hide();
    const key = (e) => e.key === 'Escape' && (e.stopPropagation(), hide());
    document.addEventListener('scroll', onscroll, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('scroll', onscroll, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener('keydown', key, true);
    };
  });

  function gapHtml(html, show) {
    return toHtml(html).replace(/\[\[(\d+)\]\]/g, (m, num) => {
      const c = q.choices[Number(num) - 1];
      if (!c) return `<span class="p-missing">${m}</span>`;
      if (q.type === 'gapselect') {
        const opts = q.choices
          .filter((x) => x.group === c.group)
          .map((x) => `<option ${show && x === c ? 'selected' : ''}>${escapeHtml(x.text)}</option>`)
          .join('');
        return `<select class="p-select${show ? ' ok' : ''}"><option></option>${opts}</select>`;
      }
      return `<span class="p-drop g${((c.group - 1) % 8) + 1}">${show ? escapeHtml(c.text) : '&nbsp;'}</span>`;
    });
  }
</script>

<svelte:document onselectionchange={onselection} />

<!-- The pointer handlers only show and hide the toolbar over selected text. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wrap" bind:this={wrapEl} {onpointerup} onpointerdown={() => (bubble = null)}>
  {#if showAnswers === null}
    <div class="bar">
      <span class="hint">Student view preview — options are shown in their original order.</span>
      {#if q.type !== 'description' && q.type !== 'essay'}
        <button class="btn btn-sm" class:active={app.revealAnswers} title="Alt+A" aria-pressed={app.revealAnswers} onclick={() => (app.revealAnswers = !app.revealAnswers)}>
          {#if app.revealAnswers}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
          <!-- Both labels take up space so the button keeps its width when toggled. -->
          <span class="swap">
            <span class:off={app.revealAnswers} aria-hidden={app.revealAnswers}>Show correct answers</span>
            <span class:off={!app.revealAnswers} aria-hidden={!app.revealAnswers}>Hide correct answers</span>
          </span>
        </button>
      {/if}
    </div>
  {/if}

  <div class="que">
    <div class="side">
      <div class="info">
        {#if q.type === 'description'}
          <span class="qno">Information</span>
        {:else}
          <span class="qno">Question <strong>{index + 1}</strong></span>
          <span class="small">Not yet answered</span>
          <span class="small">Marked out of {round(mark, 2).toFixed(2)}</span>
          <span class="small flag"><Flag size={12} /> Flag question</span>
        {/if}
      </div>
    </div>

    <div class="formulation">
      <div class="qtext rendered" data-edit={plainText ? 'questiontext' : undefined}>
        {#if q.type === 'cloze'}
          {@html clozeHtml(q.questiontext, reveal)}
        {:else if q.type === 'gapselect' || q.type === 'ddwtos'}
          {@html gapHtml(q.questiontext, reveal)}
        {:else if q.type === 'calculated'}
          {@html toHtml(substitute(q.questiontext, q, set), q.questiontextformat)}
        {:else}
          {@html toHtml(q.questiontext, q.questiontextformat)}
        {/if}
      </div>

      {#if q.type === 'multichoice'}
        <div class="prompt">{q.single ? 'Select one:' : 'Select one or more:'}</div>
        <div class="answers">
          {#each q.answers as a, i (a.id)}
            <label class="choice" class:correct={reveal && a.fraction > 0}>
              <input type={q.single ? 'radio' : 'checkbox'} name="mc-{q.id}" checked={reveal && a.fraction > 0} />
              <span class="num">{numberLabel(i, q.answernumbering)}</span>
              <span class="rendered" data-edit={editKey(`answer:${a.id}`)}>{@html toHtml(a.text)}</span>
              {#if reveal && a.fraction !== 0 && a.fraction !== 100}<span class="badge {a.fraction > 0 ? 'success' : 'danger'}">{round(a.fraction, 2)}%</span>{/if}
            </label>
          {/each}
        </div>
      {:else if q.type === 'truefalse'}
        <div class="prompt">Select one:</div>
        <div class="answers">
          {#each [true, false] as v}
            <label class="choice" class:correct={reveal && q.correct === v}>
              <input type="radio" name="tf-{q.id}" checked={reveal && q.correct === v} />
              <span>{v ? 'True' : 'False'}</span>
            </label>
          {/each}
        </div>
      {:else if q.type === 'shortanswer' || q.type === 'numerical'}
        {@const best = q.answers.find((a) => Number(a.fraction) === 100)}
        <label class="ans-line">
          Answer:
          <input class="p-input" class:ok={reveal} value={reveal && best ? best.text : ''} size="24" />
          {#if q.type === 'numerical' && q.units?.length && q.showunits !== 3}
            <select class="p-select">{#each q.units as u}<option>{u.unit}</option>{/each}</select>
          {/if}
        </label>
        {#if reveal}
          <p class="right">
            Accepted: {q.answers
              .filter((a) => a.fraction > 0)
              .map((a) => `${a.text}${a.tolerance ? ` ± ${a.tolerance}` : ''}${a.fraction < 100 ? ` (${round(a.fraction, 2)}%)` : ''}`)
              .join(', ')}
          </p>
        {/if}
      {:else if q.type === 'calculated'}
        {@const values = itemValues(q, set)}
        {@const right = q.answers.filter((a) => a.fraction > 0 && String(a.text).trim()).map((a) => ({ a, r: tryEvaluate(a.text, values) }))}
        {@const best = right.find((x) => Number(x.a.fraction) === 100 && !x.r.error)}
        <label class="ans-line">
          Answer:
          <input class="p-input" class:ok={reveal} value={reveal && best ? formatAnswer(best.r.value, best.a.correctanswerformat, best.a.correctanswerlength) : ''} size="24" />
          {#if q.units?.length && q.showunits !== 3}
            <select class="p-select">{#each q.units as u}<option>{u.unit}</option>{/each}</select>
          {/if}
        </label>
        {#if reveal}
          <p class="right">
            Accepted: {right
              .map(({ a, r }) => (r.error ? `Error in ${a.text}` : `${formatAnswer(r.value, a.correctanswerformat, a.correctanswerlength)} ${toleranceText(a)}${a.fraction < 100 ? ` (${round(a.fraction, 2)}%)` : ''}`))
              .join(', ')}
          </p>
        {/if}
        {#if (q.itemcount || 0) > 1}
          <div class="sets">
            <span class="small">Value set {set + 1} of {q.itemcount}</span>
            <button class="btn btn-sm" title="Show the question with other values" onclick={() => (valueSet = (set + 1) % q.itemcount)}><Dices size={14} /> Other values</button>
          </div>
        {/if}
      {:else if q.type === 'essay'}        {#if q.responseformat !== 'noinline'}
          <div class="essay rendered" contenteditable="true" style:min-height="{q.responsefieldlines * 1.5}em" class:mono={q.responseformat === 'monospaced'}>
            {@html toHtml(q.responsetemplate)}
          </div>
        {/if}
        {#if q.attachments !== 0}
          <div class="attach">Attachments: drag and drop files here ({q.attachments === -1 ? 'unlimited' : `max ${q.attachments}`})</div>
        {/if}
        {#if q.minwordlimit || q.maxwordlimit}
          <p class="small">Word limit: {q.minwordlimit || 0}–{q.maxwordlimit || '∞'}</p>
        {/if}
      {:else if q.type === 'matching'}
        {@const answers = [...new Set(q.subquestions.map((s) => s.answer).filter(Boolean))]}
        <table class="match">
          <tbody>
            {#each q.subquestions.filter((s) => stripHtml(s.text) || /<img/i.test(s.text)) as s (s.id)}
              <tr>
                <td class="rendered" data-edit={editKey(`subq:${s.id}`)}>{@html toHtml(s.text)}</td>
                <td>
                  <select class="p-select" class:ok={reveal}>
                    <option>Choose…</option>
                    {#each answers as a}<option selected={reveal && a === s.answer}>{a}</option>{/each}
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if q.type === 'ddwtos'}
        <div class="chips">
          {#each q.choices as c (c.id)}
            <span class="p-chip g{((c.group - 1) % 8) + 1}">{c.text}</span>
          {/each}
        </div>
      {:else if q.type === 'ordering'}
        <div class="prompt">Drag the items into the correct order.</div>
        <ol class="order" class:horizontal={q.layouttype === 'HORIZONTAL'}>
          {#each reveal ? q.items : [...q.items].reverse() as it (it.id)}
            <li class="rendered" data-edit={editKey(`item:${it.id}`)}>{@html toHtml(it.text)}</li>
          {/each}
        </ol>
      {/if}
    </div>

    {#if reveal && q.generalfeedback}
      <div class="feedback rendered" data-edit={editKey('generalfeedback')}>{@html toHtml(q.generalfeedback)}</div>
    {/if}
  </div>
  <span class="probe" aria-hidden="true" bind:this={probe}></span>
  {#if bubble}
    <div class="bubble" class:below={bubble.below} role="toolbar" aria-label="Format the selected text" style:left="{bubble.x}px" style:top="{bubble.y}px">
      {#each BUBBLE_TOOLS as t (t.cmd)}
        <button
          type="button"
          class="tb"
          class:on={bubble.on[t.cmd]}
          title={t.title}
          aria-label={t.title}
          aria-pressed={t.tags ? !!bubble.on[t.cmd] : undefined}
          tabindex="-1"
          onpointerdown={(e) => (e.preventDefault(), e.stopPropagation())}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => format(t.cmd)}><t.icon size={15} /></button
        >
        {#if t.cmd === 'code'}
          <span class="sep"></span>
          <button
            type="button"
            class="tb"
            class:on={caseOpen}
            title="Change case"
            aria-label="Change case"
            aria-haspopup="menu"
            aria-expanded={caseOpen}
            tabindex="-1"
            onpointerdown={(e) => (e.preventDefault(), e.stopPropagation())}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => (caseOpen = !caseOpen)}><CaseSensitive size={16} /></button
          >
        {/if}
      {/each}
      {#if caseOpen}
        <div class="case-menu" class:up={bubble.below === false} role="menu" aria-label="Change case">
          {#each CASES as c (c.id)}
            <button
              type="button"
              role="menuitem"
              tabindex="-1"
              onpointerdown={(e) => (e.preventDefault(), e.stopPropagation())}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => format(`case:${c.id}`)}>{c.label}</button
            >
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .swap {
    display: inline-grid;
  }
  .swap > span {
    grid-area: 1 / 1;
  }
  .swap .off {
    visibility: hidden;
  }
  .wrap {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .que {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .side {
    width: 130px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .qno {
    font-size: 14px;
  }
  .qno strong {
    font-size: 18px;
  }
  .small {
    font-size: 12px;
    color: var(--text-3);
  }
  .flag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .formulation {
    flex: 1;
    min-width: 280px;
    padding: 16px 18px;
    border-radius: var(--radius);
    background: color-mix(in srgb, #0ea5e9 9%, var(--surface));
    border: 1px solid color-mix(in srgb, #0ea5e9 22%, var(--border));
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .qtext {
    line-height: 1.9;
  }
  .prompt {
    font-size: 13px;
    color: var(--text-2);
  }
  .answers {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }
  .choice input {
    margin-top: 4px;
    accent-color: var(--accent);
  }
  .choice.correct {
    background: var(--success-soft);
    outline: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  }
  .num {
    min-width: 18px;
    color: var(--text-2);
  }
  .ans-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sets {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .right {
    font-size: 13px;
    color: var(--success);
  }
  .essay {
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    outline: none;
  }
  .essay.mono {
    font-family: var(--mono);
  }
  .attach {
    padding: 18px;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--text-3);
    text-align: center;
    font-size: 13px;
  }
  .match {
    border-collapse: collapse;
  }
  .match td {
    padding: 6px 10px 6px 0;
    vertical-align: middle;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .order {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .order.horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .order li {
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    cursor: grab;
  }
  .feedback {
    flex-basis: 100%;
    margin-left: 144px;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
    border: 1px solid color-mix(in srgb, #f59e0b 30%, var(--border));
  }
  .wrap :global(.p-input),
  .wrap :global(.p-select) {
    height: 30px;
    padding: 0 8px;
    border-radius: 5px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    vertical-align: middle;
  }
  .wrap :global(.ok) {
    border-color: var(--success);
    background: var(--success-soft);
  }
  .wrap :global(.p-group.v) {
    display: inline-flex;
    flex-direction: column;
    vertical-align: top;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }
  .wrap :global(.p-group.h) {
    display: inline-flex;
    gap: 12px;
  }
  .wrap :global(.p-drop),
  .wrap :global(.p-chip) {
    display: inline-block;
    min-width: 80px;
    padding: 1px 10px;
    border-radius: 5px;
    text-align: center;
    line-height: 1.6;
  }
  .wrap :global(.p-drop) {
    border: 2px dashed var(--gc);
    background: color-mix(in srgb, var(--gc) 8%, var(--surface));
  }
  .wrap :global(.p-chip) {
    border: 1px solid var(--gc);
    background: color-mix(in srgb, var(--gc) 18%, var(--surface));
    cursor: grab;
  }
  .wrap :global(.g1) { --gc: #6366f1; }
  .wrap :global(.g2) { --gc: #0ea5e9; }
  .wrap :global(.g3) { --gc: #10b981; }
  .wrap :global(.g4) { --gc: #f59e0b; }
  .wrap :global(.g5) { --gc: #ef4444; }
  .wrap :global(.g6) { --gc: #a855f7; }
  .wrap :global(.g7) { --gc: #ec4899; }
  .wrap :global(.g8) { --gc: #64748b; }
  .wrap :global(.p-missing) {
    color: var(--danger);
    font-family: var(--mono);
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
  .bubble.below {
    transform: translate(-50%, 0);
  }
  @keyframes bubble-in {
    from {
      opacity: 0;
    }
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
  .tb:hover {
    background: var(--hover);
    color: var(--text);
  }
  .tb.on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--border);
  }
  .case-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    display: flex;
    flex-direction: column;
    min-width: 190px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.15));
  }
  .case-menu.up {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .case-menu button {
    padding: 6px 10px;
    border: none;
    border-radius: 5px;
    background: none;
    text-align: left;
    font-size: 13px;
    cursor: pointer;
  }
  .case-menu button:hover {
    background: var(--hover);
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
  .wrap [data-edit] {
    outline: none;
  }
  @container (max-width: 520px) {
    .formulation {
      min-width: 0;
    }
    .side {
      width: 100%;
    }
    .info {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .feedback {
      margin-left: 0;
    }
  }
</style>
