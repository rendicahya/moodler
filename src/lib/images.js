// Shrinks pasted or inserted images before they are embedded in a question, so quizzes stay small to export,
// import into Moodle and upload. Photos and large screenshots are scaled down and re-encoded; small images,
// animations (GIF) and drawings (SVG) are kept as they are.

/** Longest side, in pixels, an embedded image is scaled down to. Wide enough for a full-width figure in Moodle. */
export const MAX_SIDE = 1600;
// Files below this size are kept unless they are larger than MAX_SIDE.
const SMALL = 150 * 1024;
const KEEP_TYPES = ['image/gif', 'image/svg+xml'];

/** The scaled size of an image so that its longest side is at most `max`. */
export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const encode = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** Whether any pixel is not fully opaque. */
function hasTransparency(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * An image file as a data URL, shrunk when that saves a good deal of space.
 * Resolves to { url, original, before, after }: `original` is the unchanged file's data URL when the image was
 * shrunk, else null; `before` and `after` are sizes in bytes.
 */
export async function imageForEditor(file) {
  const original = await readAsDataUrl(file);
  const kept = { url: original, original: null, before: file.size, after: file.size };
  if (KEEP_TYPES.includes(file.type) || typeof createImageBitmap !== 'function') return kept;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return kept;
  }
  try {
    const big = Math.max(bitmap.width, bitmap.height) > MAX_SIDE;
    if (!big && file.size <= SMALL) return kept;
    const { width, height } = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Transparent images stay PNG. Otherwise JPEG suits photos, but blurs the text and lines of screenshots and
    // diagrams, which usually compress well as PNG anyway, so PNG is kept unless it is much bigger.
    const png = await encode(canvas, 'image/png');
    let best = png;
    if (file.type === 'image/jpeg' || !hasTransparency(ctx, width, height)) {
      const jpeg = await encode(canvas, 'image/jpeg', 0.85);
      if (jpeg && (!png || (file.type === 'image/jpeg' ? jpeg.size < png.size : jpeg.size * 1.6 < png.size))) best = jpeg;
    }
    // Only worth it when it saves at least a fifth.
    if (!best || best.size > file.size * 0.8) return kept;
    return { url: await readAsDataUrl(best), original, before: file.size, after: best.size };
  } finally {
    bitmap.close?.();
  }
}

export const sizeText = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
