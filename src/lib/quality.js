// Checks that catch common problems in generated questions: where the correct answers sit, answers that give
// themselves away by their length, and questions that repeat each other.
import { stripHtml } from './model.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Answers like "All of the above" refer to the others, so they keep their place when answers are rearranged.
const PINNED =
  /\b(all|none|both|neither) of (the )?(above|these|them)\b|\b(semua|tidak ada|bukan)( jawaban| pilihan)?( yang)?( di ?atas| benar| salah)\b|\b[a-e],? (dan|and|&) [a-e]\b/i;

export const isPinned = (answer) => PINNED.test(stripHtml(answer.text));

/** Index of the correct answer of a single-answer multiple-choice question, or -1 for any other question. */
export function correctPosition(q) {
  if (q.type !== 'multichoice' || !q.single || (q.answers?.length ?? 0) < 2) return -1;
  const correct = q.answers.filter((a) => Number(a.fraction) === 100);
  return correct.length === 1 ? q.answers.indexOf(correct[0]) : -1;
}

/** Whether the correct answer is noticeably longer than every other answer, a hint students learn to use. */
export function correctIsLongest(q) {
  const at = correctPosition(q);
  if (at < 0 || q.answers.length < 3) return false;
  const len = q.answers.map((a) => stripHtml(a.text).length);
  const other = Math.max(...len.filter((_, i) => i !== at));
  return len[at] >= other * 1.25 && len[at] - other >= 8;
}

/**
 * Where the correct answers of the single-answer multiple-choice questions are.
 * `positions[i]` counts the questions whose key is answer i, `expected[i]` how many there would be if keys were
 * spread evenly. `skewed` is set when some position clearly gets more (or none) of the keys than it should.
 */
export function answerKeyReport(questions) {
  const mc = questions.filter((q) => correctPosition(q) >= 0);
  const width = Math.max(0, ...mc.map((q) => q.answers.length));
  const positions = Array(width).fill(0);
  const expected = Array(width).fill(0);
  for (const q of mc) {
    positions[correctPosition(q)]++;
    for (let i = 0; i < q.answers.length; i++) expected[i] += 1 / q.answers.length;
  }
  const skewed =
    mc.length >= 4 && positions.some((n, i) => (n - expected[i] >= 2 && n > expected[i] * 1.6) || (n === 0 && expected[i] >= 2.5));
  const longest = mc.filter(correctIsLongest);
  // By chance the key would be the clearly longest answer only now and then; flag it when it is a pattern.
  const longSkew = mc.length >= 4 && longest.length >= 3 && longest.length / mc.length > 0.35;
  return { questions: mc, positions, expected, skewed, longest, longSkew };
}

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Reorders the answers of single-answer multiple-choice questions so the correct answers are spread evenly over
 * the positions, in a random pattern. Answers such as "All of the above" stay where they are. Changes the
 * questions in place and returns how many were reordered.
 */
export function balanceAnswers(questions) {
  const used = [];
  let changed = 0;
  for (const q of shuffled(questions.filter((q) => correctPosition(q) >= 0))) {
    const answers = q.answers;
    const key = answers[correctPosition(q)];
    const free = answers.map((a, i) => (isPinned(a) ? -1 : i)).filter((i) => i >= 0);
    if (free.length < 2 || isPinned(key)) continue;
    // The least used free position, picking at random among ties.
    const least = Math.min(...free.map((i) => used[i] ?? 0));
    const target = shuffled(free.filter((i) => (used[i] ?? 0) === least))[0];
    used[target] = (used[target] ?? 0) + 1;
    const others = shuffled(free.map((i) => answers[i]).filter((a) => a !== key));
    const order = answers.map((a, i) => (!free.includes(i) ? a : i === target ? key : others.pop()));
    if (order.some((a, i) => a !== answers[i])) changed++;
    q.answers = order;
  }
  return changed;
}

// ---------------------------------------------------------------- duplicates

/** All the text that makes a question what it is: the question text and its answers. */
export function questionContent(q) {
  const parts = [q.questiontext];
  for (const key of ['answers', 'choices', 'items']) for (const row of q[key] ?? []) parts.push(row.text);
  for (const s of q.subquestions ?? []) parts.push(s.text, s.answer);
  if (q.type === 'truefalse') parts.push(String(q.correct));
  return parts.map(stripHtml).join(' ');
}

export function words(text) {
  const found = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(found);
}

/** Share of words two questions have in common (Jaccard index), from 0 to 1. */
export function similarity(a, b) {
  if (!a.size && !b.size) return 1;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/**
 * Groups questions that are the same or nearly so.
 * @param {{ id: string, quizId: string, q: object }[]} entries
 * @param {object} [o]
 * @param {number} [o.threshold]  minimum similarity to count as a duplicate
 * @param {string} [o.focus]      only report groups with at least one question from this quiz
 * @returns {{ score: number, entries: object[] }[]} groups, most similar first; entries keep their input order
 */
export function findDuplicates(entries, { threshold = 0.75, focus = null } = {}) {
  const items = entries
    .filter((e) => e.q.type !== 'description')
    .map((e) => ({ e, w: words(questionContent(e.q)) }))
    .filter((x) => x.w.size);
  items.forEach((x, i) => (x.i = i));
  const bySize = [...items].sort((a, b) => a.w.size - b.w.size);
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const best = new Map();

  for (let a = 0; a < bySize.length; a++) {
    const x = bySize[a];
    for (let b = a + 1; b < bySize.length; b++) {
      const y = bySize[b];
      // Similarity can't reach the threshold once one question has that many more words than the other.
      if (x.w.size < y.w.size * threshold) break;
      if (focus && x.e.quizId !== focus && y.e.quizId !== focus) continue;
      // Very short questions only count when they are identical.
      const s = similarity(x.w, y.w);
      if (s < (Math.min(x.w.size, y.w.size) < 6 ? 1 : threshold)) continue;
      const r1 = root(x.i);
      const r2 = root(y.i);
      const merged = Math.max(s, best.get(r1) ?? 0, best.get(r2) ?? 0);
      parent[r2] = r1;
      best.set(r1, merged);
    }
  }

  const groups = new Map();
  for (const x of items) {
    const r = root(x.i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(x.e);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([r, list]) => ({ score: best.get(r) ?? 1, entries: list }))
    .sort((a, b) => b.score - a.score);
}
