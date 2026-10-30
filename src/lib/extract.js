// Reads the text of course material files (PDF, Word, PowerPoint, OpenDocument, plain text) in the browser,
// so it can go into an AI prompt. Nothing is uploaded.
import { unzipSync, strFromU8 } from 'fflate';
import { decodeEntities } from './model.js';

export const MATERIAL_ACCEPT = '.pdf,.docx,.pptx,.odt,.odp,.txt,.md,.markdown,.csv,.html,.htm';
const TEXT_EXTS = ['txt', 'md', 'markdown', 'csv'];

export const extOf = (name) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
export const isSupported = (name) => MATERIAL_ACCEPT.split(',').includes('.' + extOf(name));

/** Tidies extracted text: no trailing spaces, at most one blank line in a row. */
export function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+\n/g, '\n')
    .replace(/[ \u00a0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text of an Office Open XML or OpenDocument part, one line per paragraph. */
export function xmlText(xml) {
  const text = xml
    // Field codes and deleted (tracked) text are not part of what readers see.
    .replace(/<w:(instrText|delText)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
    .replace(/<(w:tab|text:tab)\b[^>]*\/>/g, '\t')
    .replace(/<(w:br|w:cr|a:br|text:line-break)\b[^>]*\/>/g, '\n')
    .replace(/<text:s\b[^>]*\/>/g, ' ')
    // Table cells are separated by tabs, rows by line breaks.
    .replace(/<\/(w:p|a:p|text:p)>\s*<\/(w:tc|a:tc|table:table-cell)>/g, '\t')
    .replace(/<\/(w:tr|a:tr|table:table-row)>/g, '\n')
    .replace(/<\/(w:p|a:p|text:p|text:h)>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(text));
}

const slideNumber = (path) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** Text of a .docx, .pptx, .odt or .odp file from its bytes. */
export function officeText(bytes, ext) {
  if (ext === 'docx') {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
    const doc = files['word/document.xml'];
    if (!doc) throw new Error('This is not a Word document.');
    return xmlText(strFromU8(doc));
  }
  if (ext === 'pptx') {
    const files = unzipSync(bytes, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
    const slides = Object.keys(files).sort((a, b) => slideNumber(a) - slideNumber(b));
    if (!slides.length) throw new Error('This is not a PowerPoint presentation.');
    return slides
      .map((name) => [`[Slide ${slideNumber(name)}]`, xmlText(strFromU8(files[name]))])
      .filter(([, text]) => text)
      .map((s) => s.join('\n'))
      .join('\n\n');
  }
  const files = unzipSync(bytes, { filter: (f) => f.name === 'content.xml' });
  if (!files['content.xml']) throw new Error('This is not an OpenDocument file.');
  let xml = strFromU8(files['content.xml']);
  // Number the slides of a presentation, like PowerPoint's.
  let n = 0;
  if (ext === 'odp') xml = xml.replace(/<draw:page\b[^>]*>/g, () => `<text:p>[Slide ${++n}]</text:p>`);
  return xmlText(xml);
}

function htmlText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  for (const el of doc.querySelectorAll('br')) el.replaceWith('\n');
  for (const el of doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article')) el.append('\n');
  return tidy(doc.body?.textContent ?? '');
}

async function pdfText(bytes) {
  // pdf.js is large, so it is only loaded when a PDF is added.
  const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('');
      pages.push(tidy(text));
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  // A page number per page helps the AI and the teacher refer back to the material.
  return pages.map((text, i) => (text ? `[Page ${i + 1}]\n${text}` : '')).filter(Boolean).join('\n\n');
}

/** Resolves to the text of a material file; an empty string means it has no text (e.g. a scanned PDF). */
export async function extractText(file) {
  const ext = extOf(file.name);
  if (TEXT_EXTS.includes(ext)) return tidy(await file.text());
  if (ext === 'html' || ext === 'htm') return htmlText(await file.text());
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === 'pdf') return pdfText(bytes);
  if (['docx', 'pptx', 'odt', 'odp'].includes(ext)) return officeText(bytes, ext);
  throw new Error('This file type is not supported.');
}
