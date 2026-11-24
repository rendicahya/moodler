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

/**
 * Whether the correct answer (or, in a multiple-answer question, every correct answer) is noticeably longer than
 * every wrong one: students learn to pick the longest option, and AI chatbots often write answers this way.
 */
export function correctIsLongest(q) {
  if (q.type !== 'multichoice' || (q.answers?.length ?? 0) < 3) return false;
  const correct = q.single ? (correctPosition(q) < 0 ? [] : [q.answers[correctPosition(q)]]) : q.answers.filter((a) => Number(a.fraction) > 0);
  // "All of the above" is long by nature and gives nothing away by it.
  if (!correct.length || correct.some(isPinned)) return false;
  const len = (a) => stripHtml(a.text).length;
  const others = q.answers.filter((a) => !correct.includes(a) && !isPinned(a)).map(len);
  if (others.length < 2) return false;
  const other = Math.max(...others);
  const shortest = Math.min(...correct.map(len));
  return shortest >= other * 1.25 && shortest - other >= 8;
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
  // Answer lengths are checked in multiple-answer questions too.
  const pool = questions.filter((q) => q.type === 'multichoice' && (q.answers?.length ?? 0) >= 3 && q.answers.some((a) => Number(a.fraction) > 0));
  const longest = pool.filter(correctIsLongest);
  // By chance the key would be the clearly longest answer only now and then; flag it when it is a pattern.
  const longSkew = pool.length >= 4 && longest.length >= 3 && longest.length / pool.length > 0.35;
  return { questions: mc, positions, expected, skewed, longest, longSkew, longPool: pool.length };
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

// ---------------------------------------------------------------- answers that refer to their place

// Answers whose meaning depends on where they stand: "All of the above", "None of the above", "A and B".
const ABOVE = /\b(above|di ?atas)\b/i;
const LETTER_PAIR = /(^|\s)\(?[a-e]\)?,? (dan|and|&|or|atau) \(?[a-e]\)?(\s|[.,]|$)/i;

export const refersToPlace = (answer) => {
  const text = stripHtml(answer.text).trim();
  return text.length <= 60 && (ABOVE.test(text) || LETTER_PAIR.test(text));
};
const refersAbove = (answer) => refersToPlace(answer) && ABOVE.test(stripHtml(answer.text));

/**
 * Problems with answers such as "All of the above" in a multiple-choice question: `shuffled` when Moodle may
 * shuffle them into another place, `notLast` when an "… of the above" answer has ordinary answers after it.
 */
export function placeProblem(q) {
  if (q.type !== 'multichoice' || !q.answers?.some(refersToPlace)) return null;
  if (q.shuffleanswers) return 'shuffled';
  const last = q.answers.findLastIndex((a) => !refersToPlace(a));
  return q.answers.some((a, i) => i < last && refersAbove(a)) ? 'notLast' : null;
}

/** Turns off shuffling and moves "… of the above" answers after the ordinary ones. Returns whether anything changed. */
export function fixPlace(q) {
  if (!placeProblem(q)) return false;
  q.shuffleanswers = false;
  const last = q.answers.findLastIndex((a) => !refersToPlace(a));
  const moved = q.answers.filter((a, i) => i < last && refersAbove(a));
  if (moved.length) q.answers = [...q.answers.filter((a) => !moved.includes(a)), ...moved];
  return true;
}

// ---------------------------------------------------------------- repeated and empty answers

// Pictures, formulas and other markup without text still make an answer that isn't empty.
const HAS_CONTENT = /<(img|svg|math|video|audio|iframe|object)\b/i;

/**
 * What a student sees of an answer: its text with the spaces evened out, or, when it holds a picture or other
 * markup, the HTML itself. Formatting that doesn't show (a <p> around the text, extra spaces) doesn't count, but
 * everything else does: "Paris" and "paris" or "Paris." are different answers.
 */
function answerKey(html) {
  const s = String(html ?? '');
  if (HAS_CONTENT.test(s)) return s.replace(/\s+/g, ' ').trim();
  return stripHtml(s).replace(/\s+/g, ' ').trim();
}

/**
 * The lists in a question whose entries should all differ, as { what, rows: [{ n, text }], blank } with n the
 * 1-based number; `blank` says which rows count as empty.
 */
function answerLists(q) {
  const rows = (list) => (list ?? []).map((x, i) => ({ n: i + 1, text: x.text, group: x.group, answer: x.answer }));
  const noText = (r) => !answerKey(r.text);
  switch (q.type) {
    case 'multichoice':
      return [{ what: 'answers', rows: rows(q.answers), blank: noText }];
    case 'ordering':
      return [{ what: 'items', rows: rows(q.items), blank: noText }];
    case 'matching':
      // A pair with an answer but no question is an extra wrong answer, so only pairs with neither are empty.
      return [{ what: 'pairs', rows: rows(q.subquestions), blank: (r) => noText(r) && !String(r.answer ?? '').trim() }];
    case 'gapselect':
    case 'ddwtos': {
      // The same word in two groups belongs to different gaps, so repeats only count within a group.
      const groups = new Map();
      for (const c of rows(q.choices)) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
      return [...groups.values()].map((list) => ({ what: 'choices', rows: list, blank: noText }));
    }
    default:
      return [];
  }
}

/**
 * Answers in one question that are exactly the same, or empty. Answers that are only alike ("increases" and
 * "decreases", "1998" and "1989") are normal and not reported.
 * Returns [{ what, kind: 'same' | 'empty', items }] with `items` the 1-based numbers in their list.
 */
export function answerProblems(q) {
  const found = [];
  const empty = new Map();
  for (const { what, rows, blank } of answerLists(q)) {
    const seen = new Map();
    for (const r of rows) {
      if (blank(r)) {
        empty.set(what, [...(empty.get(what) ?? []), r.n]);
        continue;
      }
      const key = answerKey(r.text);
      if (!key) continue;
      seen.set(key, [...(seen.get(key) ?? []), r.n]);
    }
    for (const items of seen.values()) if (items.length > 1) found.push({ what, kind: 'same', items });
  }
  for (const [what, items] of empty) found.push({ what, kind: 'empty', items: items.sort((a, b) => a - b) });
  return found;
}

/** "Answers 2 and 4 are the same", "Answer 3 is empty". */
export function answerProblemText(p) {
  const one = { answers: 'Answer', items: 'Item', pairs: 'Pair', choices: 'Choice' }[p.what] ?? p.what;
  const list = p.items.length === 1 ? `${one} ${p.items[0]}` : `${one}s ${p.items.slice(0, -1).join(', ')} and ${p.items.at(-1)}`;
  const verb = p.items.length === 1 ? 'is' : 'are';
  return `${list} ${verb} ${p.kind === 'same' ? 'the same' : 'empty'}`;
}

// ---------------------------------------------------------------- images without alt text

const IMG = /<img\b[^>]*>/gi;
const ALT = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
// What editors and phones name pictures, which says nothing about what they show.
const FILE_NAME = /^[^\s/\\]*\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif)$/i;
const GENERIC = /^(image|img|picture|pic|photo|foto|gambar|screenshot|screen ?shot|clipboard|untitled|pasted image)[\s_-]*[\d\s_-]*$/i;

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The alt text of an <img> tag, or null when it has none. */
export function altOf(tag) {
  const m = tag.match(ALT);
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Whether an alt text is missing or only a file name, so a student using a screen reader learns nothing. */
export function altIsMissing(alt) {
  const a = (alt ?? '').trim();
  return !a || FILE_NAME.test(a) || GENERIC.test(a);
}

/** Every text field of a question that contains a picture, as [path, html]; a path is ['answers', 2, 'feedback']. */
function* imageFields(q) {
  for (const [key, value] of Object.entries(q)) {
    if (typeof value === 'string') {
      if (/<img\b/i.test(value)) yield [[key], value];
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const row = value[i];
        if (!row || typeof row !== 'object') continue;
        for (const [field, v] of Object.entries(row)) if (typeof v === 'string' && /<img\b/i.test(v)) yield [[key, i, field], v];
      }
    }
  }
}

/** The pictures of a question without a useful alt text: [{ path, index, src, alt }], `index` counting within its field. */
export function imagesWithoutAlt(q) {
  const found = [];
  for (const [path, html] of imageFields(q)) {
    let index = 0;
    for (const [tag] of html.matchAll(IMG)) {
      const alt = altOf(tag);
      if (altIsMissing(alt)) found.push({ path, index, src: tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find((x) => x != null) ?? '', alt });
      index++;
    }
  }
  return found;
}

/** Sets the alt text of the `index`-th picture in the field at `path`. */
export function setImageAlt(q, path, index, alt) {
  const owner = path.length === 1 ? q : q[path[0]]?.[path[1]];
  const field = path.at(-1);
  if (typeof owner?.[field] !== 'string') return;
  let n = 0;
  owner[field] = owner[field].replace(IMG, (tag) => {
    if (n++ !== index) return tag;
    const rest = tag.replace(ALT, '').replace(/^<img\b/i, '');
    return `<img alt="${encode(alt.trim())}"${rest}`;
  });
}

/** Where a picture is, in words: "the question text", "answer 2", "the feedback of answer 3". */
export function placeName(path) {
  const NAMES = {
    questiontext: 'the question text',
    generalfeedback: 'the general feedback',
    correctfeedback: 'the feedback for a correct response',
    partiallycorrectfeedback: 'the feedback for a partly correct response',
    incorrectfeedback: 'the feedback for an incorrect response',
    feedbacktrue: 'the feedback for True',
    feedbackfalse: 'the feedback for False',
    graderinfo: 'the information for graders',
    responsetemplate: 'the response template',
  };
  if (path.length === 1) return NAMES[path[0]] ?? path[0];
  const ROWS = { answers: 'answer', choices: 'choice', items: 'item', subquestions: 'pair', hints: 'hint' };
  const row = `${ROWS[path[0]] ?? path[0]} ${path[1] + 1}`;
  return path[2] === 'text' ? row : path[2] === 'feedback' ? `the feedback of ${row}` : path[2] === 'answer' ? `the answer of ${row}` : `${row} (${path[2]})`;
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
