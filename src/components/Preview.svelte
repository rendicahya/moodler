<script>
  import { Flag, Eye, EyeOff } from '@lucide/svelte';
  import { TYPE_MAP, escapeHtml, round, stripHtml } from '../lib/model.js';
  import { parseCloze, CLOZE_RE, isChoiceCloze, canonicalClozeType } from '../lib/formats/cloze.js';
  import { sanitizeHtml } from '../lib/sanitize.js';
  import { app } from '../lib/store.svelte.js';

  // `showAnswers` lets a parent control the answer reveal (the whole-quiz preview); without it the pane has its own toggle,
  // which stays on when moving to another question. `nav` is rendered under the question info box.
  let { q, index, showAnswers = null, nav = null } = $props();
  const reveal = $derived(showAnswers ?? app.revealAnswers);

  const toHtml = (text, format = 'html') => (format === 'html' ? sanitizeHtml(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>'));
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

<div class="wrap">
  {#if showAnswers === null}
    <div class="bar">
      <span class="hint">Student view preview — options are shown in their original order.</span>
      {#if q.type !== 'description' && q.type !== 'essay'}
        <button class="btn btn-sm" class:active={app.revealAnswers} onclick={() => (app.revealAnswers = !app.revealAnswers)}>
          {#if app.revealAnswers}<EyeOff size={15} /> Hide answers{:else}<Eye size={15} /> Show correct answers{/if}
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
      {@render nav?.()}
    </div>

    <div class="formulation">
      <div class="qtext rendered">
        {#if q.type === 'cloze'}
          {@html clozeHtml(q.questiontext, reveal)}
        {:else if q.type === 'gapselect' || q.type === 'ddwtos'}
          {@html gapHtml(q.questiontext, reveal)}
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
              <span class="rendered">{@html toHtml(a.text)}</span>
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
      {:else if q.type === 'essay'}
        {#if q.responseformat !== 'noinline'}
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
                <td class="rendered">{@html toHtml(s.text)}</td>
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
            <li class="rendered">{@html toHtml(it.text)}</li>
          {/each}
        </ol>
      {/if}
    </div>

    {#if reveal && q.generalfeedback}
      <div class="feedback rendered">{@html toHtml(q.generalfeedback)}</div>
    {/if}
  </div>
</div>

<style>
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
