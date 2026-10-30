// PDF download of the printable quiz: the print document is laid out in a hidden frame at the paper's width, cut
// into pages between questions (a question only splits when it is taller than a page), and each page is drawn
// into the PDF as an image. The libraries are loaded only when a PDF is made.

import { PAPERS, PAGE_MARGIN } from './print.js';
import { downloadBlob } from './download.js';

const PX_PER_MM = 96 / 25.4;
const SCALE = 2;

function waitForImages(doc) {
  const pending = [...doc.images].filter((img) => !img.complete);
  return Promise.all(pending.map((img) => new Promise((done) => (img.onload = img.onerror = done))));
}

/** Where the pages break, as [top, bottom] pairs in CSS pixels. */
function pageSlices(doc, pageHeight) {
  const body = doc.body;
  const end = body.scrollHeight;
  const units = [...doc.querySelectorAll('header.top, .intro, main > section, .answer-key h2, .answer-key li')].map((el) => {
    const r = el.getBoundingClientRect();
    // A page that starts with this unit leaves out its divider line.
    const border = parseFloat(getComputedStyle(el).borderTopWidth) || 0;
    return { top: r.top, bottom: r.bottom, border, breakBefore: el.matches('.answer-key h2') };
  });
  const slices = [];
  let start = 0;
  for (const u of units) {
    if (u.breakBefore && u.top > start) {
      slices.push([start, u.top]);
      start = u.top;
    }
    while (u.bottom - start > pageHeight) {
      if (u.top > start + 1) {
        // Move the whole question to the next page.
        slices.push([start, u.top]);
        start = u.top + u.border;
      } else {
        // Taller than a page: cut it.
        slices.push([start, start + pageHeight]);
        start += pageHeight;
      }
    }
  }
  if (end - start > 1) slices.push([start, end]);
  return slices;
}

/**
 * Makes a PDF from a document built by buildPrintHtml and downloads it.
 * @param {string} html
 * @param {{ paper?: string, filename: string, title?: string, onProgress?: (done: number, total: number) => void }} options
 */
export async function downloadPdf(html, { paper = 'a4', filename, title = '', onProgress = () => {} }) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const size = PAPERS[paper] ?? PAPERS.a4;
  const contentWidth = size.width - 2 * PAGE_MARGIN.x;
  const contentHeight = size.height - 2 * PAGE_MARGIN.y;
  const width = Math.round(contentWidth * PX_PER_MM);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:1000px;border:0`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    doc.documentElement.classList.add('pdf');
    await waitForImages(doc);
    await doc.fonts?.ready;

    const slices = pageSlices(doc, contentHeight * PX_PER_MM);
    const pdf = new jsPDF({ unit: 'mm', format: [size.width, size.height], orientation: 'portrait', compress: true });
    pdf.setProperties({ title, creator: 'Moodler' });
    for (let i = 0; i < slices.length; i++) {
      onProgress(i, slices.length);
      const [top, bottom] = slices[i];
      const canvas = await html2canvas(doc.body, {
        scale: SCALE,
        y: top,
        height: Math.ceil(bottom - top),
        width,
        windowWidth: width,
        backgroundColor: '#ffffff',
        logging: false,
      });
      if (i) pdf.addPage([size.width, size.height], 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', PAGE_MARGIN.x, PAGE_MARGIN.y, contentWidth, canvas.height / SCALE / PX_PER_MM, undefined, 'FAST');
      if (slices.length > 1) {
        pdf.setFontSize(8);
        pdf.setTextColor(110);
        pdf.text(`${i + 1} / ${slices.length}`, size.width / 2, size.height - PAGE_MARGIN.y / 2, { align: 'center' });
      }
    }
    onProgress(slices.length, slices.length);
    downloadBlob(pdf.output('blob'), filename);
    return slices.length;
  } finally {
    frame.remove();
  }
}
