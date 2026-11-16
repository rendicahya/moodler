// Reading a photo or scan of an answer sheet (see exam.js): find the four black corner markers, map the sheet's
// millimetres onto the photo through them (a perspective transform, so a sheet photographed at an angle reads
// too), read the code squares to learn the version and page, then measure how dark each bubble is.

import { SHEET, sheetFrame, sheetPages, codePositions, blankPositions, readCode } from './exam.js';

const MAX_SIDE = 1800;

/** A grey image ({ width, height, data }) from an image file, at most MAX_SIDE pixels on its longer side. */
export async function loadGray(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return { width, height, data };
}

/** Dark pixels, compared with the brightness around them, so uneven light doesn't matter. */
function threshold({ width, height, data }) {
  const sum = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x];
      sum[(y + 1) * (width + 1) + x + 1] = sum[y * (width + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(width, height) / 25));
  const dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const total = sum[y1 * (width + 1) + x1] - sum[y0 * (width + 1) + x1] - sum[y1 * (width + 1) + x0] + sum[y0 * (width + 1) + x0];
      const mean = total / ((x1 - x0) * (y1 - y0));
      dark[y * width + x] = data[y * width + x] < mean * 0.75 && data[y * width + x] < 160 ? 1 : 0;
    }
  }
  return dark;
}

/** Solid, roughly square dark blobs, largest first: [{ x, y, area }] with the centre in pixels. */
export function findBlobs(dark, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const blobs = [];
  const min = (width * height) / 20000;
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0, sx = 0, sy = 0, x0 = width, x1 = 0, y0 = height, y1 = 0;
    while (top) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && dark[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[top++] = p - 1);
      if (x < width - 1 && dark[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[top++] = p + 1);
      if (y > 0 && dark[p - width] && !seen[p - width]) (seen[p - width] = 1), (stack[top++] = p - width);
      if (y < height - 1 && dark[p + width] && !seen[p + width]) (seen[p + width] = 1), (stack[top++] = p + width);
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    // A square turned by up to 45° still fills half its bounding box.
    if (area >= min && w / h < 2 && h / w < 2 && area / (w * h) > 0.5) blobs.push({ x: sx / area, y: sy / area, area });
  }
  return blobs.sort((a, b) => b.area - a.area);
}

/** The perspective transform taking the four `from` points to the four `to` points, as a function. */
export function homography(from, to) {
  // Solve the 8 unknowns h0..h7 (h8 = 1) by Gaussian elimination.
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return ({ x, y }) => {
    const w = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  };
}

/** Four points in order around their centre. */
function around(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

function* combinations(n, k, start = 0, picked = []) {
  if (picked.length === k) yield picked;
  else for (let i = start; i < n; i++) yield* combinations(n, k, i + 1, [...picked, i]);
}

/** Mean brightness of a disc of `radius` mm around a point of the frame. */
function sample(img, map, { x, y }, radius) {
  let total = 0;
  let count = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      const p = map({ x: x + (dx * radius) / 2, y: y + (dy * radius) / 2 });
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
      total += img.data[py * img.width + px];
      count++;
    }
  return total / count;
}

/**
 * Reads an answer sheet from a grey image. `versions` are the exam's versions' sheet items, `paper` its printable
 * size in mm and `check` the expected check number.
 * Resolves to { version, page, checkOk, answers: { [itemIndex]: Set }, doubtful: [itemIndex] }; throws when the
 * markers or code can't be found.
 */
export function readSheet(img, { versions, size, check }) {
  const frame = sheetFrame(size.width, size.height);
  const corners = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.height },
    { x: 0, y: frame.height },
  ];
  const blobs = findBlobs(threshold(img), img.width, img.height).slice(0, 10);
  if (blobs.length < 4) throw new Error('The four black corner squares were not found. Take the photo with the whole sheet in view.');

  // Try groups of the largest blobs as the markers, in each of the four turns, and keep the reading whose code makes
  // sense, preferring one with the right check number.
  let best = null;
  for (const group of combinations(blobs.length, 4)) {
    const points = group.map((i) => blobs[i]);
    const areas = points.map((p) => p.area);
    if (Math.max(...areas) > Math.min(...areas) * 3) continue;
    const ring = around(points);
    for (let turn = 0; turn < 4; turn++) {
      const map = homography(
        corners,
        corners.map((_, i) => ring[(i + turn) % 4])
      );
      if (!map) continue;
      const black = points.reduce((s, p) => s + img.data[Math.round(p.y) * img.width + Math.round(p.x)], 0) / 4;
      const whites = blankPositions(frame).map((p) => sample(img, map, p, 1.5));
      if (whites.some((w) => w == null)) continue;
      const white = whites.reduce((a, b) => a + b, 0) / whites.length;
      if (white - black < 40) continue;
      const darkness = (p, r) => {
        const g = sample(img, map, p, r);
        return g == null ? null : (white - g) / (white - black);
      };
      const bits = codePositions(frame).map((p) => darkness(p, SHEET.code * 0.25));
      if (bits.some((b) => b == null)) continue;
      const code = readCode(bits.map((d) => (d > 0.5 ? 1 : 0)));
      // How clearly the squares read as filled or empty.
      const clarity = Math.min(...bits.map((d) => Math.abs(d - 0.5)));
      if (!code || code.version >= versions.length) continue;
      const score = (code.check === check ? 10 : 0) + clarity;
      if (!best || score > best.score) best = { score, code, map, darkness };
    }
    if (best?.score >= 10) break;
  }
  if (!best) throw new Error('This photo could not be read as an answer sheet. Take it straight on, in good light, with the whole sheet in view.');

  const { code, darkness } = best;
  const items = versions[code.version];
  const page = sheetPages(items, frame)[code.page];
  if (!page) throw new Error(`The sheet says it is sheet ${code.page + 1}, but this exam has fewer sheets.`);
  const answers = {};
  const doubtful = [];
  for (const { item, index, bubbles } of page.items) {
    const levels = bubbles.map((b) => darkness(b, SHEET.bubble * 0.28) ?? 0);
    const picked = new Set();
    levels.forEach((d, k) => d > 0.42 && picked.add(k));
    // Faint marks, such as an erased answer, or two answers on a one-answer question.
    if (levels.some((d) => d > 0.28 && d <= 0.55) || (!item.multi && picked.size > 1)) doubtful.push(index);
    answers[index] = picked;
  }
  return { version: code.version, page: code.page, checkOk: code.check === check, answers, doubtful, pages: sheetPages(items, frame).length };
}
