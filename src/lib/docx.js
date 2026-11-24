// Word (.docx) download of the printable quiz. The document built by buildPrintHtml is read element by element and
// written as Word paragraphs, tables and pictures, so the result can be edited in Word like any other document.

import { zipSync, strToU8 } from 'fflate';
import { PAPERS, PAGE_MARGIN } from './print.js';

// Word measures in twentieths of a point (twips), half points for text, and EMU for pictures.
const TWIPS_PER_MM = 1440 / 25.4;
const TWIPS_PER_PX = 15;
const EMU_PER_PX = 9525;
const QUESTION_INDENT = 567;
const GREY = '555555';
const GREEN = '0A6B2F';
const MONO = 'Consolas';
const SYMBOL = 'Segoe UI Symbol';
const BOX = { top: 4, left: 4, bottom: 4, right: 4 };

const twips = (mm) => Math.round(mm * TWIPS_PER_MM);

/** Escapes text for XML, leaving out the control characters XML does not allow. */
export const xmlText = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A CSS color as RRGGBB, or null when it is not a plain hex or rgb() color. */
export function cssColor(value) {
  const v = String(value ?? '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
  return m ? [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
}

// ---------- XML of runs, paragraphs and tables. The order of the properties is fixed by the file format. ----------

function runProps(f) {
  const x = [
    f.font ? `<w:rFonts w:ascii="${f.font}" w:hAnsi="${f.font}" w:eastAsia="${f.font}" w:cs="${f.font}"/>` : '',
    f.b ? '<w:b/><w:bCs/>' : '',
    f.i ? '<w:i/><w:iCs/>' : '',
    f.strike ? '<w:strike/>' : '',
    f.color ? `<w:color w:val="${f.color}"/>` : '',
    f.size ? `<w:sz w:val="${f.size}"/><w:szCs w:val="${f.size}"/>` : '',
    f.u ? '<w:u w:val="single"/>' : '',
    f.box ? '<w:bdr w:val="single" w:sz="4" w:space="0" w:color="666666"/>' : '',
    f.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${f.shade}"/>` : '',
    f.vert ? `<w:vertAlign w:val="${f.vert}"/>` : '',
  ].join('');
  return x && `<w:rPr>${x}</w:rPr>`;
}

function pictureXml({ rId, id, width, height, alt }) {
  const cx = Math.max(1, Math.round(width * EMU_PER_PX));
  const cy = Math.max(1, Math.round(height * EMU_PER_PX));
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${xmlText(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function runXml(run) {
  const content = run.tab ? '<w:tab/>' : run.br ? '<w:br/>' : run.picture ? pictureXml(run.picture) : `<w:t xml:space="preserve">${xmlText(run.t)}</w:t>`;
  return `<w:r>${runProps(run.f ?? {})}${content}</w:r>`;
}

function paragraphXml({ runs, p }) {
  const borders = p.border
    ? `<w:pBdr>${['top', 'left', 'bottom', 'right', 'between']
        .filter((side) => p.border[side])
        .map((side) => `<w:${side} w:val="single" w:sz="${p.border[side]}" w:space="${p.borderSpace ?? 4}" w:color="${p.borderColor ?? '999999'}"/>`)
        .join('')}</w:pBdr>`
    : '';
  const tabs = [...(p.hanging ? [{ pos: p.left }] : []), ...(p.tabs ?? [])];
  const x = [
    p.style ? `<w:pStyle w:val="${p.style}"/>` : '',
    p.keepNext ? '<w:keepNext/>' : '',
    p.keepLines ? '<w:keepLines/>' : '',
    p.pageBreak ? '<w:pageBreakBefore/>' : '',
    borders,
    p.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>` : '',
    tabs.length ? `<w:tabs>${tabs.map((t) => `<w:tab w:val="${t.align ?? 'left'}"${t.leader ? ` w:leader="${t.leader}"` : ''} w:pos="${t.pos}"/>`).join('')}</w:tabs>` : '',
    p.before != null || p.after != null || p.line
      ? `<w:spacing${p.before != null ? ` w:before="${p.before}"` : ''}${p.after != null ? ` w:after="${p.after}"` : ''}${p.line ? ` w:line="${p.line}" w:lineRule="exact"` : ''}/>`
      : '',
    p.left || p.hanging ? `<w:ind w:left="${p.left ?? 0}"${p.right ? ` w:right="${p.right}"` : ''}${p.hanging ? ` w:hanging="${p.hanging}"` : ''}/>` : '',
    p.jc ? `<w:jc w:val="${p.jc}"/>` : '',
  ].join('');
  return `<w:p>${x && `<w:pPr>${x}</w:pPr>`}${runs.map(runXml).join('')}</w:p>`;
}

function tableXml({ rows, widths, left, bordered }) {
  const border = bordered ? `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="666666"/>`).join('')}</w:tblBorders>` : '';
  const cell = (c) => {
    const pr = [
      `<w:tcW w:w="${widths.slice(c.col, c.col + c.colSpan).reduce((s, w) => s + w, 0)}" w:type="dxa"/>`,
      c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : '',
      c.merge ? `<w:vMerge${c.merge === 'start' ? ' w:val="restart"' : ''}/>` : '',
      c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.shade}"/>` : '',
    ].join('');
    // A cell has to end with a paragraph.
    const end = c.blocks.length && c.blocks.at(-1).runs ? '' : '<w:p/>';
    return `<w:tc><w:tcPr>${pr}</w:tcPr>${blocksXml(c.blocks)}${end}</w:tc>`;
  };
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((s, w) => s + w, 0)}" w:type="dxa"/><w:tblInd w:w="${left}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
}

// Two tables in a row would be joined into one, so a small paragraph keeps them apart.
const blocksXml = (blocks) => blocks.map((b, i) => (b.runs ? paragraphXml(b) : (i && !blocks[i - 1].runs ? '<w:p/>' : '') + tableXml(b))).join('');

// ---------- Reading the printable document ----------

const BLOCK_TAGS = new Set('ADDRESS ARTICLE ASIDE BLOCKQUOTE CENTER DD DETAILS DIV DL DT FIGCAPTION FIGURE FOOTER H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN NAV OL P PRE SECTION SUMMARY TABLE UL'.split(' '));
const SKIP_TAGS = new Set('SCRIPT STYLE TEMPLATE HEAD TITLE NOSCRIPT'.split(' '));
const HEADING_SIZE = { H1: 32, H2: 28, H3: 25, H4: 23, H5: 22, H6: 22 };
const FORMAT_TAGS = {
  STRONG: { b: true },
  B: { b: true },
  TH: { b: true },
  EM: { i: true },
  I: { i: true },
  CITE: { i: true },
  VAR: { i: true },
  U: { u: true },
  INS: { u: true },
  S: { strike: true },
  STRIKE: { strike: true },
  DEL: { strike: true },
  SUB: { vert: 'subscript' },
  SUP: { vert: 'superscript' },
  CODE: { font: MONO },
  KBD: { font: MONO },
  SAMP: { font: MONO },
  TT: { font: MONO },
  PRE: { font: MONO, size: 19 },
  SMALL: { size: 18 },
  MARK: { shade: 'FFF59D' },
  A: { color: '0563C1', u: true },
};
const CLASS_FORMATS = {
  right: { b: true },
  pct: { b: false, color: GREY, size: 18 },
  muted: { color: GREY, size: 19 },
  prompt: { color: '444444', size: 19 },
  gapno: { color: GREY, vert: 'superscript' },
  fill: { b: true, u: true, color: GREEN },
};

function formatOf(el, f) {
  const out = { ...f, ...FORMAT_TAGS[el.tagName] };
  for (const c of el.classList) Object.assign(out, CLASS_FORMATS[c]);
  const s = el.style;
  const color = cssColor(s.color) ?? (el.tagName === 'FONT' ? cssColor(el.getAttribute('color')) : null);
  if (color) out.color = color;
  const shade = cssColor(s.backgroundColor);
  if (shade) out.shade = shade;
  if (s.fontWeight) out.b = s.fontWeight === 'bold' || s.fontWeight === 'bolder' || Number(s.fontWeight) >= 600;
  if (s.fontStyle) out.i = s.fontStyle !== 'normal';
  const deco = `${s.textDecoration} ${s.textDecorationLine}`;
  if (/underline/.test(deco)) out.u = true;
  if (/line-through/.test(deco)) out.strike = true;
  if (s.verticalAlign === 'sub') out.vert = 'subscript';
  if (s.verticalAlign === 'super') out.vert = 'superscript';
  return out;
}

const alignOf = (el) => ({ left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', justify: 'both' })[el.style.textAlign || (el.getAttribute('align') ?? '').toLowerCase()] ?? (el.tagName === 'CENTER' ? 'center' : null);

const has = (el, name) => el.classList.contains(name);
const child = (el, selector) => el.querySelector(`:scope > ${selector}`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Turns the body of a printable document into blocks. `pictures` maps each image element to its picture, if any. */
function readBody(body, pictures, contentWidth) {
  let pictureId = 0;
  // Set when the next paragraph has to start on a new page.
  let pageBreak = false;

  // ctx: where the blocks go (out), the width of the column, the properties of new paragraphs (p), the text format (f),
  // runs that open the next paragraph (lead), and whether this is the author's own HTML (rich), whose class names mean nothing here.
  const within = (ctx, p = {}, f = {}) => ({ ...ctx, p: { ...ctx.p, ...p }, f: { ...ctx.f, ...f } });

  function startParagraph(ctx) {
    const para = { runs: [], p: { ...ctx.p } };
    if (pageBreak) {
      para.p.pageBreak = true;
      pageBreak = false;
    }
    if (ctx.lead && !ctx.lead.used) {
      ctx.lead.used = true;
      para.runs.push(...ctx.lead.runs);
      Object.assign(para.p, ctx.lead.p);
    }
    return para;
  }

  function endParagraph(para, ctx) {
    const last = () => para.runs.at(-1);
    while (last()?.br) para.runs.pop();
    if (last()?.t && !last().pre) last().t = last().t.replace(/[ \t\r\n]+$/, '');
    if (last()?.t === '') para.runs.pop();
    if (para.runs.length) ctx.out.push(para);
    else if (para.p.pageBreak) pageBreak = true;
  }

  function paragraph(ctx, runs, p = {}) {
    const para = startParagraph(within(ctx, p));
    para.runs.push(...runs);
    ctx.out.push(para);
    return para;
  }

  /** Puts a number or circle waiting for its paragraph in one of its own, before something it cannot be part of. */
  function flushLead(ctx) {
    if (pageBreak || (ctx.lead && !ctx.lead.used)) ctx.out.push(startParagraph(ctx));
  }

  // A thin empty paragraph, which keeps tables and boxes apart.
  const gap = (ctx) => ctx.out.push({ runs: [], p: { ...ctx.p, line: 120, after: 0 } });

  /** Runs `read` with runs that open its first paragraph, such as a number or an answer circle. */
  function withLead(ctx, runs, p, read) {
    const lead = { runs, p, used: false };
    read({ ...ctx, lead });
    if (!lead.used) ctx.out.push(startParagraph({ ...ctx, lead }));
  }

  // ---------- Text within a paragraph ----------

  function pushText(runs, value, f) {
    let t = value.replace(/[ \t\r\n\f]+/g, ' ');
    const prev = runs.at(-1);
    if (t.startsWith(' ') && (!prev || prev.tab || prev.br || (prev.t && prev.t.endsWith(' ')))) t = t.slice(1);
    if (t) runs.push({ t, f });
  }

  function symbol(el) {
    const on = el.classList.contains('on');
    const t = el.classList.contains('circle') ? (on ? '●' : '○') : on ? '☑' : '☐';
    return { t, f: { font: SYMBOL, ...(on ? { color: GREEN } : {}) } };
  }

  function inline(node, runs, ctx) {
    if (node.nodeType === 3) return pushText(runs, node.data, ctx.f);
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) return;
    const el = node;
    if (el.tagName === 'BR') return runs.push({ br: true });
    if (el.tagName === 'IMG') return picture(el, runs, ctx);
    if (!ctx.rich && has(el, 'box')) return runs.push(symbol(el));
    if (has(el, 'blank') && !el.hasChildNodes()) return runs.push({ t: '_'.repeat(Math.min(60, Math.max(4, Math.round((parseFloat(el.style.minWidth) || 10) * 1.9)))), f: {} });
    if (!ctx.rich && has(el, 'word')) return runs.push({ t: ` ${text(el)} `, f: { ...ctx.f, box: true } }, { t: '  ', f: {} });
    const inner = { ...ctx, f: formatOf(el, ctx.f) };
    const breaks = BLOCK_TAGS.has(el.tagName) && runs.length > 0;
    if (breaks && !runs.at(-1).br) runs.push({ br: true });
    for (const c of el.childNodes) inline(c, runs, inner);
  }

  function picture(el, runs, ctx) {
    const pic = pictures.get(el);
    if (!pic) return pushText(runs, `[${el.getAttribute('alt') || 'picture'}]`, { ...ctx.f, color: GREY });
    const ratio = pic.height / pic.width;
    const css = (v) => (/^\d+(\.\d+)?(px)?$/.test(v ?? '') ? parseFloat(v) : 0);
    const size = (name) => css(el.style[name]) || css(el.getAttribute(name));
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(el.style.width || el.getAttribute('width') || '');
    const room = Math.max(40, (ctx.width - (ctx.p.left ?? 0)) / TWIPS_PER_PX);
    let width = percent ? (room * Number(percent[1])) / 100 : size('width');
    let height = percent ? 0 : size('height');
    if (!width && !height) width = pic.width;
    if (!width) width = height / ratio;
    if (!height) height = width * ratio;
    const scale = Math.min(1, room / width, 800 / height);
    runs.push({ picture: { rId: pic.rId, id: ++pictureId, width: width * scale, height: height * scale, alt: el.getAttribute('alt') || '' } });
  }

  // ---------- Blocks ----------

  const isBlock = (el) => BLOCK_TAGS.has(el.tagName);
  const holdsBlock = (el) => [...el.querySelectorAll('*')].some(isBlock);

  function flow(nodes, ctx) {
    let para = null;
    const flush = () => {
      if (para) endParagraph(para, ctx);
      para = null;
    };
    for (const n of nodes) {
      if (n.nodeType === 1) {
        if (SKIP_TAGS.has(n.tagName)) continue;
        if (isBlock(n)) {
          flush();
          block(n, ctx);
          continue;
        }
        if (n.tagName !== 'IMG' && holdsBlock(n)) {
          flush();
          flow(n.childNodes, { ...ctx, f: formatOf(n, ctx.f) });
          continue;
        }
      } else if (n.nodeType !== 3 || (!para && !n.data.trim())) continue;
      para ??= startParagraph(ctx);
      inline(n, para.runs, ctx);
    }
    flush();
  }

  /** Writes an element of the paper itself, such as a question or its answers. Returns false for any other element. */
  function layout(el, ctx) {
    const left = ctx.p.left ?? 0;
    const rich = { ...ctx, rich: true };
    if (has(el, 'version')) version(el, ctx);
    else if (has(el, 'top')) header(el, ctx);
    else if (has(el, 'intro')) flow(el.childNodes, rich);
    else if (has(el, 'answer-key')) answerKey(el, ctx);
    else if (has(el, 'q')) question(el, ctx);
    else if (has(el, 'choices')) choices(el, ctx);
    else if (has(el, 'match')) match(el, ctx);
    else if (has(el, 'lines')) {
      // Word joins paragraphs with the same border into one box, so the lines also need a rule between them.
      for (const _ of el.children) ctx.out.push({ runs: [], writing: true, p: { ...ctx.p, line: 440, after: 0, border: { bottom: 4, between: 4 }, borderSpace: 0 } });
    } else if (has(el, 'bank')) {
      const runs = [];
      for (const w of el.children) inline(w, runs, ctx);
      paragraph(ctx, runs, { border: BOX, left: left + 80, right: 80, before: 60, after: 100 });
    } else if (has(el, 'feedback') || has(el, 'key-note')) {
      gap(ctx);
      flow(el.childNodes, within(rich, { border: { left: 16 }, shade: 'F4F4F4', left: left + 120 }, { size: 20 }));
    } else return false;
    return true;
  }

  function block(el, ctx) {
    if (!ctx.rich && layout(el, ctx)) return;

    const f = formatOf(el, ctx.f);
    const jc = alignOf(el);
    const p = jc ? { jc } : {};
    switch (el.tagName) {
      case 'TABLE':
        return table(el, ctx, { bordered: true });
      case 'UL':
      case 'OL':
        return list(el, { ...ctx, f });
      case 'PRE':
        return pre(el, { ...ctx, f });
      case 'HR':
        return ctx.out.push({ runs: [], p: { ...ctx.p, border: { bottom: 6 }, after: 80 } });
      case 'BLOCKQUOTE':
        return flow(el.childNodes, within({ ...ctx, f }, { left: (ctx.p.left ?? 0) + 360, ...p }));
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6':
        return flow(el.childNodes, within(ctx, { keepNext: true, before: 120, ...p }, { ...f, b: true, size: HEADING_SIZE[el.tagName] }));
      default:
        return flow(el.childNodes, within({ ...ctx, f }, p));
    }
  }

  function version(el, ctx) {
    if (el.previousElementSibling?.classList.contains('version')) pageBreak = true;
    flow(el.childNodes, ctx);
  }

  function header(el, ctx) {
    const right = [{ align: 'right', pos: ctx.width }];
    const label = child(el, '.title-row > .ver');
    const start = ctx.out.length;
    paragraph(ctx, [{ t: text(el.querySelector('h1')), f: {} }, ...(label ? [{ tab: true }, { t: text(label), f: { size: 28 } }] : [])], { style: 'Heading1', tabs: right, after: 40 });
    const meta = child(el, '.meta');
    if (meta) paragraph(ctx, [{ t: text(meta), f: { color: GREY, size: 19 } }], { after: 0 });
    const student = child(el, '.student');
    if (student) {
      // A line to write on is a tab filled with underscores.
      const fields = [...student.children];
      const stops = [0.56, 0.78, 1].map((x) => Math.round(ctx.width * x));
      const runs = fields.flatMap((field, i) => [{ t: `${i ? '  ' : ''}${text(field)} `, f: {} }, { tab: true }]);
      paragraph(ctx, runs, { before: 200, after: 0, tabs: stops.map((pos) => ({ pos, leader: 'underscore' })).slice(0, fields.length) });
    }
    Object.assign(ctx.out.at(-1).p, { border: { bottom: 12 }, borderSpace: 8, borderColor: '000000', after: 200 });
    for (const b of ctx.out.slice(start)) b.p.keepNext = true;
  }

  function question(el, ctx) {
    if (has(el, 'info')) return flow(el.childNodes, within({ ...ctx, rich: true }, { before: 120 }));
    const out = [];
    const body = child(el, '.qbody');
    const inner = within({ ...ctx, out }, { left: QUESTION_INDENT });
    withLead(inner, [{ t: text(el.querySelector('.qno')), f: { b: true } }, { tab: true }], { hanging: QUESTION_INDENT, before: 200 }, (c) => {
      flow(child(body, '.qtext').childNodes, { ...c, rich: true });
      // A question without text still needs its number before the answers.
      if (!c.lead.used) out.push(startParagraph(c));
    });
    const mark = text(el.querySelector('.qmark'));
    if (mark) {
      const run = { t: ` (${mark})`, f: { color: GREY, size: 18 } };
      const last = out.at(-1);
      if (last.runs?.at(-1) && !last.runs.some((r) => r.pre)) last.runs.push(last.runs.at(-1).tab ? { ...run, t: run.t.trim() } : run);
      else paragraph(inner, [{ ...run, t: run.t.trim() }]);
    }
    flow([...body.childNodes].filter((n) => !(n.nodeType === 1 && has(n, 'qtext'))), inner);
    // Keep a question on one page where it fits, except for the lines of an essay.
    const paras = out.flatMap(function all(b) {
      return b.runs ? [b] : b.rows.flat().flatMap((c) => c.blocks.flatMap(all));
    });
    const lastKept = paras.findLastIndex((b) => !b.writing);
    paras.forEach((b, i) => {
      b.p.keepLines = true;
      if (i < lastKept || (i === lastKept && lastKept < paras.length - 1)) b.p.keepNext = true;
    });
    ctx.out.push(...out);
  }

  function choices(el, ctx) {
    const left = ctx.p.left ?? 0;
    if (has(el, 'tf')) {
      const runs = [];
      for (const li of el.children) {
        if (runs.length) runs.push({ tab: true });
        runs.push(symbol(child(li, '.box')), { t: ` ${text(child(li, '.opt'))}`, f: formatOf(li, ctx.f) });
      }
      return paragraph(ctx, runs, { tabs: [{ pos: left + 1400 }], before: 40 });
    }
    for (const li of el.children) {
      const runs = [];
      const box = child(li, '.box');
      const order = child(li, '.order-box');
      const lbl = text(child(li, '.lbl'));
      if (box) runs.push(symbol(box));
      if (order) runs.push({ t: ` ${text(order) || '  '} `, f: { box: true, ...(text(order) ? { b: true, color: GREEN } : {}) } });
      if (lbl) runs.push({ t: ` ${lbl}`, f: formatOf(li, ctx.f) });
      runs.push({ tab: true });
      const hanging = order ? 560 : lbl ? 700 : 400;
      withLead(within(ctx, { left: left + hanging, after: 20 }, formatOf(li, ctx.f)), runs, { hanging }, (c) => {
        const opt = child(li, '.opt');
        if (opt) flow(opt.childNodes, { ...c, rich: true });
      });
    }
  }

  function match(el, ctx) {
    const left = ctx.p.left ?? 0;
    const room = ctx.width - left;
    const rows = child(el, 'table');
    if (rows) {
      const pick = [...rows.querySelectorAll('.pick')].some((c) => c.querySelector('.fill')) ? Math.round(room * 0.4) : 1300;
      table(rows, ctx, { bordered: false, widths: [500, room - 500 - pick, pick] });
    }
    for (const li of child(el, '.bank-list')?.children ?? []) {
      const runs = [];
      for (const n of li.childNodes) inline(n, runs, ctx);
      paragraph(ctx, runs, { border: BOX, left: left + 80, right: 80, after: 0 });
    }
  }

  function list(el, ctx) {
    if (ctx.lead && !ctx.lead.used) flushLead(ctx);
    const left = (ctx.p.left ?? 0) + 400;
    let n = el.tagName === 'OL' ? Number(el.getAttribute('start')) || 1 : 0;
    for (const item of el.children) {
      if (item.tagName !== 'LI') {
        flow([item], within(ctx, { left }));
        continue;
      }
      if (n && item.hasAttribute('value')) n = Number(item.getAttribute('value')) || n;
      const marker = n ? `${listNumber(n++, el.getAttribute('type') || el.style.listStyleType)}.` : '•';
      withLead(within(ctx, { left, after: 20 }, formatOf(item, ctx.f)), [{ t: marker, f: {} }, { tab: true }], { hanging: 400 }, (c) => flow(item.childNodes, c));
    }
  }

  function pre(el, ctx) {
    if (ctx.lead && !ctx.lead.used) flushLead(ctx);
    const lines = el.textContent.replace(/\r\n?/g, '\n').replace(/^\n|\n+$/g, '').split('\n');
    lines.forEach((line, i) => {
      const para = startParagraph(within(ctx, { shade: 'F4F4F4', after: i === lines.length - 1 ? 100 : 0, keepLines: true }));
      para.runs.push({ t: line.replace(/\t/g, '    '), f: ctx.f, pre: true });
      ctx.out.push(para);
    });
  }

  function answerKey(el, ctx) {
    pageBreak = true;
    paragraph(ctx, [{ t: text(child(el, 'h2')), f: {} }], { style: 'Heading2' });
    for (const li of child(el, 'ol')?.children ?? []) {
      withLead(within(ctx, { left: QUESTION_INDENT, after: 40, keepLines: true }), [{ t: `${li.getAttribute('value')}.`, f: { b: true } }, { tab: true }], { hanging: QUESTION_INDENT }, (c) => flow(li.childNodes, { ...c, rich: true }));
    }
  }

  function table(el, ctx, { bordered, widths }) {
    const left = ctx.p.left ?? 0;
    const rows = [];
    // Cells still covered by a cell higher up, per column.
    const open = [];
    for (const tr of el.rows) {
      const row = [];
      let col = 0;
      const covered = () => {
        while (open[col]?.left > 0) {
          const { colSpan } = open[col];
          open[col].left--;
          row.push({ col, colSpan, merge: 'go', blocks: [] });
          col += colSpan;
        }
      };
      for (const td of tr.cells) {
        covered();
        const colSpan = Math.max(1, Math.min(50, td.colSpan || 1));
        const rowSpan = Math.max(1, td.rowSpan || 1);
        open[col] = { left: rowSpan - 1, colSpan };
        row.push({ col, colSpan, merge: rowSpan > 1 ? 'start' : null, td, blocks: [] });
        col += colSpan;
      }
      covered();
      if (row.length) rows.push(row);
    }
    const columns = Math.max(0, ...rows.map((r) => r.at(-1).col + r.at(-1).colSpan));
    if (!columns) return;
    if (widths?.length !== columns) widths = columnWidths(rows, columns, ctx.width - left);
    for (const row of rows) {
      const end = row.at(-1).col + row.at(-1).colSpan;
      if (end < columns) row.push({ col: end, colSpan: columns - end, merge: null, blocks: [] });
      for (const cell of row) {
        if (!cell.td) continue;
        const width = widths.slice(cell.col, cell.col + cell.colSpan).reduce((s, w) => s + w, 0) - 160;
        const jc = alignOf(cell.td) ?? (cell.td.tagName === 'TH' ? 'center' : null);
        cell.shade = cssColor(cell.td.style.backgroundColor);
        flow(cell.td.childNodes, { out: cell.blocks, width, rich: true, p: { after: 0, ...(jc ? { jc } : {}) }, f: { ...formatOf(cell.td, ctx.f), shade: undefined } });
      }
    }
    // Empty cells get a paragraph too, so every row can be kept with the next.
    for (const cell of rows.flat()) if (!cell.blocks.length) cell.blocks.push({ runs: [], p: { after: 0 } });
    flushLead(ctx);
    ctx.out.push({ rows, widths, left, bordered });
    gap(ctx);
  }

  const out = [];
  flow(body.childNodes, { out, width: contentWidth, p: {}, f: {} });
  return out;
}

/** Column widths in proportion to the longest text in each column, within limits. */
function columnWidths(rows, columns, room) {
  const need = Array(columns).fill(4);
  for (const row of rows) {
    for (const c of row) {
      if (!c.td || c.colSpan > 1) continue;
      const pictures = [...c.td.querySelectorAll('img')].length ? 24 : 0;
      need[c.col] = Math.max(need[c.col], pictures, Math.min(40, text(c.td).length + 3));
    }
  }
  const total = need.reduce((s, n) => s + n, 0);
  // A character is about 115 twips wide; narrow tables do not fill the page.
  const all = Math.min(room, total * 130);
  return need.map((n) => Math.floor((all * n) / total));
}

function listNumber(n, type) {
  const alpha = () => {
    let s = '';
    for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return s;
  };
  const roman = () => {
    let s = '';
    let k = n;
    for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) for (; k >= v; k -= v) s += r;
    return s;
  };
  switch (type) {
    case 'a':
    case 'lower-alpha':
    case 'lower-latin':
      return alpha();
    case 'A':
    case 'upper-alpha':
    case 'upper-latin':
      return alpha().toUpperCase();
    case 'i':
    case 'lower-roman':
      return roman();
    case 'I':
    case 'upper-roman':
      return roman().toUpperCase();
    default:
      return String(n);
  }
}

// ---------- Pictures ----------

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };

/** Loads a picture as a file Word can show; other formats, such as WebP and SVG, are redrawn as PNG. */
async function loadPicture(src) {
  const blob = await (await fetch(src)).blob();
  const type = blob.type.split(';')[0];
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = img.naturalWidth || 300;
    const height = img.naturalHeight || 150;
    if (EXTENSIONS[type]) return { ext: EXTENSIONS[type], bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
    // Vector pictures are drawn larger, so they stay sharp on paper.
    const scale = type === 'image/svg+xml' ? 3 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((done) => canvas.toBlob(done, 'image/png'));
    return { ext: 'png', bytes: new Uint8Array(await png.arrayBuffer()), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadPictures(doc) {
  const bySrc = new Map();
  const media = [];
  let failed = 0;
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (bySrc.has(src)) continue;
    let pic = null;
    try {
      if (/^(data:|https?:|blob:)/i.test(src)) pic = await loadPicture(src);
    } catch {
      /* Not readable, such as a picture on a site that does not share it: its description is shown instead. */
    }
    if (pic) {
      pic.name = `image${media.length + 1}.${pic.ext}`;
      pic.rId = `rIdImage${media.length + 1}`;
      media.push(pic);
    } else failed++;
    bySrc.set(src, pic);
  }
  return { pictures: { get: (img) => bySrc.get(img.getAttribute('src') ?? '') }, media, failed };
}

// ---------- The file ----------

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006';

const heading = (n, size) =>
  `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading(1, 34)}${heading(2, 26)}</w:styles>`;

const field = (name) => `<w:fldSimple w:instr=" ${name} "><w:r><w:rPr><w:color w:val="${GREY}"/><w:sz w:val="17"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;
const FOOTER = `${XML}<w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${field('PAGE')}<w:r><w:rPr><w:color w:val="${GREY}"/><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve"> / </w:t></w:r>${field('NUMPAGES')}</w:p></w:ftr>`;

/**
 * Packs blocks into the bytes of a .docx file.
 * @param {{ blocks: object[], media?: { name: string, rId: string, bytes: Uint8Array }[], title?: string, paper?: string, created?: Date }} options
 */
export function packDocx({ blocks, media = [], title = '', paper = 'a4', created = new Date() }) {
  const size = PAPERS[paper] ?? PAPERS.a4;
  const x = twips(PAGE_MARGIN.x);
  const y = twips(PAGE_MARGIN.y);
  const section = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${twips(size.width)}" w:h="${twips(size.height)}"/><w:pgMar w:top="${y}" w:right="${x}" w:bottom="${y}" w:left="${x}" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>`;
  const part = (name, type) => `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  const files = {
    '[Content_Types].xml': `${XML}<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>${part('word/document.xml', 'document.main')}${part('word/styles.xml', 'styles')}${part('word/footer1.xml', 'footer')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="${PACKAGE}/relationships">${rel('rId1', `${OFFICE}/officeDocument`, 'word/document.xml')}${rel('rId2', `${PACKAGE}/relationships/metadata/core-properties`, 'docProps/core.xml')}</Relationships>`,
    'docProps/core.xml': `${XML}<cp:coreProperties xmlns:cp="${PACKAGE}/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(title)}</dc:title><dc:creator>Moodler</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`,
    'word/document.xml': `${XML}<w:document ${W} xmlns:r="${OFFICE}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${blocksXml(blocks)}${section}</w:body></w:document>`,
    'word/styles.xml': STYLES,
    'word/footer1.xml': FOOTER,
    'word/_rels/document.xml.rels': `${XML}<Relationships xmlns="${PACKAGE}/relationships">${rel('rIdStyles', `${OFFICE}/styles`, 'styles.xml')}${rel('rIdFooter', `${OFFICE}/footer`, 'footer1.xml')}${media.map((m) => rel(m.rId, `${OFFICE}/image`, `media/${m.name}`)).join('')}</Relationships>`,
  };
  const zip = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)]));
  for (const m of media) zip[`word/media/${m.name}`] = [m.bytes, { level: 0 }];
  return zipSync(zip);
}

/**
 * Makes a Word file from a document built by buildPrintHtml (without answer sheets).
 * @param {string} html
 * @param {{ paper?: string, title?: string }} options
 * @returns {Promise<{ blob: Blob, failed: number }>} failed: how many pictures could not be read
 */
export async function makeDocx(html, { paper = 'a4', title = '' } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { pictures, media, failed } = await loadPictures(doc);
  const size = PAPERS[paper] ?? PAPERS.a4;
  const blocks = readBody(doc.body, pictures, twips(size.width - 2 * PAGE_MARGIN.x));
  const bytes = packDocx({ blocks, media, title, paper });
  return { blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), failed };
}
