// Saves the images in a question as files: one by itself, or all of them in a ZIP file.

import { decodeEntities, questionTitle } from './model.js';
import { textFields } from './findreplace.js';
import { downloadBlob } from './download.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/tiff': 'tiff' };
const FILE_EXT = /\.(png|jpe?g|jfif|gif|svg|webp|bmp|avif|ico|tiff?)$/i;

/** Whether an image can be read: a file that is missing from the imported quiz is left as @@PLUGINFILE@@. */
export const isReadable = (src) => /^\s*(data:image\/|https?:|blob:)/i.test(src ?? '');

const attribute = (attrs, name) => {
  const m = new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : '';
};

/** The images in all texts of a question, each once, as { src, alt }. */
export function questionImages(q) {
  const found = new Map();
  for (const [owner, key, isHtml] of textFields(q)) {
    if (!isHtml || !/<img/i.test(owner[key])) continue;
    for (const [, attrs] of owner[key].matchAll(/<img\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
      const src = attribute(attrs, 'src').trim();
      if (isReadable(src) && !found.has(src)) found.set(src, { src, alt: attribute(attrs, 'alt') });
    }
  }
  return [...found.values()];
}

/** Text as part of a file name. */
export const fileStem = (text) =>
  [...String(text ?? '').normalize('NFC').replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ')]
    .slice(0, 60)
    .join('')
    .replace(/^[\s.]+|[\s.]+$/g, '');

/** File names without an extension, all different: an image's description or file name, or else the question's title. */
export function imageNames(images, title) {
  const used = new Set();
  return images.map(({ alt }, i) => {
    const base = fileStem(String(alt ?? '').trim().replace(FILE_EXT, '')) || (fileStem(title) || 'Image') + (images.length > 1 ? ` ${i + 1}` : '');
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    return name;
  });
}

async function load(src) {
  const response = await fetch(src);
  const blob = await response.blob();
  const type = blob.type.split(';')[0].toLowerCase();
  if (!response.ok || !type.startsWith('image/')) throw new Error('Not an image');
  return { blob, ext: EXT[type] ?? 'img' };
}

/** Downloads one image of a question; throws when it can't be read. */
export async function exportImage(q, src) {
  const images = questionImages(q);
  const i = images.findIndex((x) => x.src === src);
  const { blob, ext } = await load(src);
  downloadBlob(blob, `${imageNames(images, questionTitle(q))[i] ?? (fileStem(questionTitle(q)) || 'Image')}.${ext}`);
}

/** Downloads all images of a question as a ZIP file; resolves to how many it has and how many could not be read. */
export async function exportImages(q) {
  const images = questionImages(q);
  const names = imageNames(images, questionTitle(q));
  const loaded = await Promise.all(images.map((x) => load(x.src).catch(() => null)));
  const files = {};
  for (const [i, x] of loaded.entries()) {
    // Images are compressed already.
    if (x) files[`${names[i]}.${x.ext}`] = [new Uint8Array(await x.blob.arrayBuffer()), { level: 0 }];
  }
  const saved = Object.keys(files).length;
  if (saved) {
    const { zipSync } = await import('fflate');
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `${fileStem(questionTitle(q)) || 'Question'} images.zip`);
  }
  return { saved, failed: images.length - saved };
}

/** Puts an image on the clipboard, as PNG: the only image format all browsers can copy. */
export async function copyImage(src) {
  const png = async () => {
    const { blob } = await load(src);
    if (blob.type === 'image/png') return blob;
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 300;
      canvas.height = img.naturalHeight || 150;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('Not drawn'))), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  // The promise is passed on as it is, because Safari only allows copying right after the click.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
}
