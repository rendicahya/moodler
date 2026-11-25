// Saves the images in a question as files, as they are or in another format: one by itself, or all of them in a ZIP file.

import { decodeEntities, questionTitle } from './model.js';
import { textFields } from './findreplace.js';
import { downloadBlob } from './download.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/tiff': 'tiff' };
const FILE_EXT = /\.(png|jpe?g|jfif|gif|svg|webp|bmp|avif|ico|tiff?)$/i;

/** The formats images can be converted to, by the file extension. */
export const IMAGE_FORMATS = { png: 'PNG', jpg: 'JPEG', webp: 'WebP' };

/** The file extension of an embedded image, or '' for one on a website, whose format is only known once it is loaded. */
export const imageExt = (src) => EXT[/^\s*data:([^;,]+)/i.exec(src)?.[1].trim().toLowerCase()] ?? '';

let webp;
/** Whether the browser can write a format: Safari can't write WebP. */
export function canWrite(format) {
  if (format !== 'webp') return true;
  return (webp ??= document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'));
}

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

/** Draws an image again as PNG, JPEG or WebP. */
async function convert(blob, format, scale = 1) {
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format];
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = (img.naturalWidth || 300) * scale;
    canvas.height = (img.naturalHeight || 150) * scale;
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency; without this it would turn black.
    if (format === 'jpg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((done, fail) => canvas.toBlob((b) => (b?.type === type ? done(b) : fail(new Error('Not drawn'))), type, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Loads an image in one of IMAGE_FORMATS, or as it is without a format. An error of the conversion has `convert` set. */
async function loadAs(src, format) {
  const image = await load(src);
  if (!format || image.ext === format) return image;
  try {
    // SVG images have no fixed size, so they are drawn larger to stay sharp.
    return { blob: await convert(image.blob, format, image.ext === 'svg' ? 2 : 1), ext: format };
  } catch (e) {
    throw Object.assign(new Error('Could not convert the image', { cause: e }), { convert: true });
  }
}

/** Downloads one image of a question, as it is or in one of IMAGE_FORMATS; throws when it can't be read or converted. */
export async function exportImage(q, src, format = '') {
  const images = questionImages(q);
  const i = images.findIndex((x) => x.src === src);
  const { blob, ext } = await loadAs(src, format);
  downloadBlob(blob, `${imageNames(images, questionTitle(q))[i] ?? (fileStem(questionTitle(q)) || 'Image')}.${ext}`);
}

/** Downloads all images of a question as a ZIP file; resolves to how many it has and how many could not be read or converted. */
export async function exportImages(q, format = '') {
  const images = questionImages(q);
  const names = imageNames(images, questionTitle(q));
  const loaded = await Promise.all(images.map((x) => loadAs(x.src, format).catch(() => null)));
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
    return blob.type === 'image/png' ? blob : convert(blob, 'png');
  };
  // The promise is passed on as it is, because Safari only allows copying right after the click.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
}
