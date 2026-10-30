// Calculated questions: wildcards such as {a} in the text and the answer formulas, each with a range of random
// values. Moodle stores a fixed list of value sets ("dataset items") and gives every attempt one of them.

/** A wildcard: {name}, where the name starts with a letter (Moodle's own rule). `{=…}` and Cloze gaps don't match. */
export const WILDCARD_RE = /\{([A-Za-z][^>} <`{"'=]*)\}/g;

export const TOLERANCE_TYPES = [
  { value: 1, label: 'Relative', help: 'A share of the answer: 0.01 accepts answers within 1% of it.' },
  { value: 2, label: 'Nominal', help: 'A fixed amount: 0.5 accepts answers within ± 0.5.' },
  { value: 3, label: 'Geometric', help: 'For answers spanning several orders of magnitude.' },
];

export const MAX_ITEMS = 100;

const uid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);

/** The wildcards a question uses, in the order they first appear in the question text and then the formulas. */
export function wildcardNames(q) {
  const names = [];
  for (const text of [q.questiontext, ...(q.answers ?? []).map((a) => a.text)]) {
    for (const m of String(text ?? '').matchAll(WILDCARD_RE)) if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export function newDataset(name, count = 10) {
  const ds = { id: uid(), name, min: 1, max: 10, decimals: 1, distribution: 'uniform', status: 'private', items: [] };
  ds.items = generateValues(ds, count);
  return ds;
}

/** `count` random values in the dataset's range, rounded to its decimals. */
export function generateValues(ds, count) {
  const min = Number(ds.min) || 0;
  const max = Number(ds.max) || 0;
  const decimals = Math.max(0, Math.min(10, Math.round(Number(ds.decimals) || 0)));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const log = ds.distribution === 'loguniform' && lo > 0;
  const values = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const v = log ? Math.exp(Math.log(lo) + r * (Math.log(hi) - Math.log(lo))) : lo + r * (hi - lo);
    values.push(Number(v.toFixed(decimals)));
  }
  return values;
}

/**
 * Makes the question's datasets match its wildcards: adds one for each new wildcard, drops those no longer used, and
 * gives every dataset `itemcount` values. Changes the question only when something is out of step; returns whether it did.
 */
export function syncDatasets(q) {
  let changed = false;
  const count = Math.max(1, Math.min(MAX_ITEMS, Math.round(Number(q.itemcount) || 0) || Math.max(1, ...(q.datasets ?? []).map((d) => d.items?.length ?? 0))));
  if (q.itemcount !== count) {
    q.itemcount = count;
    changed = true;
  }
  if (!Array.isArray(q.datasets)) {
    q.datasets = [];
    changed = true;
  }
  const names = wildcardNames(q);
  const kept = q.datasets.filter((d) => names.includes(d.name));
  if (kept.length !== q.datasets.length) {
    q.datasets = kept;
    changed = true;
  }
  for (const name of names) {
    if (!q.datasets.some((d) => d.name === name)) {
      q.datasets.push(newDataset(name, count));
      changed = true;
    }
  }
  for (const ds of q.datasets) {
    if (!Array.isArray(ds.items)) ds.items = [];
    if (ds.items.length > count) {
      ds.items = ds.items.slice(0, count);
      changed = true;
    } else if (ds.items.length < count) {
      ds.items = [...ds.items, ...generateValues(ds, count - ds.items.length)];
      changed = true;
    }
  }
  return changed;
}

/** The wildcard values of value set `i`, e.g. { a: 3.5, b: 7 }. */
export function itemValues(q, i = 0) {
  return Object.fromEntries((q.datasets ?? []).map((d) => [d.name, d.items?.[i]]));
}

// ---------------------------------------------------------------- formulas

// The functions Moodle accepts in formulas, with how many arguments they take.
const FUNCTIONS = {
  abs: [1, Math.abs],
  acos: [1, Math.acos],
  acosh: [1, Math.acosh],
  asin: [1, Math.asin],
  asinh: [1, Math.asinh],
  atan: [1, Math.atan],
  atanh: [1, Math.atanh],
  atan2: [2, Math.atan2],
  ceil: [1, Math.ceil],
  cos: [1, Math.cos],
  cosh: [1, Math.cosh],
  deg2rad: [1, (x) => (x * Math.PI) / 180],
  exp: [1, Math.exp],
  expm1: [1, Math.expm1],
  floor: [1, Math.floor],
  fmod: [2, (a, b) => a % b],
  intdiv: [2, (a, b) => Math.trunc(Math.trunc(a) / Math.trunc(b))],
  log: [[1, 2], (x, base) => (base === undefined ? Math.log(x) : Math.log(x) / Math.log(base))],
  log10: [1, Math.log10],
  log1p: [1, Math.log1p],
  max: [[1, Infinity], Math.max],
  min: [[1, Infinity], Math.min],
  pi: [0, () => Math.PI],
  pow: [2, Math.pow],
  rad2deg: [1, (x) => (x * 180) / Math.PI],
  round: [[1, 2], (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d],
  sin: [1, Math.sin],
  sinh: [1, Math.sinh],
  sqrt: [1, Math.sqrt],
  tan: [1, Math.tan],
  tanh: [1, Math.tanh],
};

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/%(),]))/y;
  let at = 0;
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected "${src.slice(at).trim()[0]}"`);
    tokens.push(m[1] !== undefined ? { num: Number(m[1]) } : m[2] !== undefined ? { id: m[2] } : { op: m[3] });
    at = re.lastIndex;
  }
  return tokens;
}

/** Evaluates a Moodle formula such as "{a} * sqrt({b}) + pi()" with the given wildcard values. Throws on errors. */
export function evaluate(formula, values = {}) {
  const src = String(formula ?? '').replace(WILDCARD_RE, (m, name) => {
    const v = values[name];
    if (v === undefined || v === null || v === '' || !Number.isFinite(Number(v))) throw new Error(`{${name}} has no value`);
    return `(${Number(v)})`;
  });
  if (/[{}]/.test(src)) throw new Error('Unmatched { or }');
  const tokens = tokenize(src);
  if (!tokens.length) throw new Error('The formula is empty');
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (op) => tokens[i]?.op === op;
  const expect = (op) => {
    if (!isOp(op)) throw new Error(`Expected "${op}"`);
    i++;
  };

  function expr() {
    let v = term();
    while (isOp('+') || isOp('-')) v = tokens[i++].op === '+' ? v + term() : v - term();
    return v;
  }
  function term() {
    let v = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[i++].op;
      const r = unary();
      // PHP's % works on whole numbers.
      v = op === '*' ? v * r : op === '/' ? v / r : Math.trunc(v) % Math.trunc(r);
    }
    return v;
  }
  function unary() {
    if (isOp('-')) return i++, -unary();
    if (isOp('+')) return i++, unary();
    return power();
  }
  function power() {
    const base = primary();
    if (isOp('**')) return i++, base ** unary();
    return base;
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error('The formula ends too early');
    if (t.num !== undefined) return i++, t.num;
    if (t.op === '(') {
      i++;
      const v = expr();
      expect(')');
      return v;
    }
    if (t.id !== undefined) {
      i++;
      const fn = FUNCTIONS[t.id.toLowerCase()];
      if (!fn) throw new Error(`Unknown function "${t.id}"`);
      expect('(');
      const args = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) i++, args.push(expr());
      }
      expect(')');
      const [arity, f] = fn;
      const [lo, hi] = Array.isArray(arity) ? arity : [arity, arity];
      if (args.length < lo || args.length > hi) throw new Error(`${t.id}() takes ${lo === hi ? lo : `${lo} or more`} argument${hi === 1 ? '' : 's'}`);
      return f(...args);
    }
    throw new Error(`Unexpected "${t.op}"`);
  }

  const v = expr();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].op ?? tokens[i].id ?? tokens[i].num}"`);
  if (!Number.isFinite(v)) throw new Error('The result is not a number (division by zero?)');
  return v;
}

/** Evaluates a formula, returning { value } or { error }. */
export function tryEvaluate(formula, values) {
  try {
    return { value: evaluate(formula, values) };
  } catch (e) {
    return { error: e.message };
  }
}

/** Shows an answer the way Moodle does: with a number of decimals (format 1) or significant figures (format 2). */
export function formatAnswer(value, format = 1, length = 2) {
  const n = Math.max(0, Math.min(9, Math.round(Number(length) || 0)));
  if (Number(format) === 2) return Number(value).toPrecision(Math.max(1, n));
  return Number(value).toFixed(n);
}

export function toleranceText(a) {
  const t = Number(a.tolerance) || 0;
  if (!t) return '';
  return Number(a.tolerancetype) === 2 ? `± ${t}` : Number(a.tolerancetype) === 3 ? `± ${t} (geometric)` : `± ${+(t * 100).toFixed(4)}%`;
}

/** Puts value set `i` into the text: every {name} becomes its value, and {=formula} the formula's result. */
export function substitute(text, q, i = 0) {
  const values = itemValues(q, i);
  return String(text ?? '')
    .replace(/\{=([^{}]*(?:\{[A-Za-z][^>} <`{"'=]*\}[^{}]*)*)\}/g, (m, f) => {
      const r = tryEvaluate(f, values);
      return r.error ? m : String(+r.value.toPrecision(12));
    })
    .replace(WILDCARD_RE, (m, name) => (values[name] === undefined ? m : String(values[name])));
}

/** Problems with a calculated question's formulas and wildcards, for validation. */
export function calculatedIssues(q) {
  const issues = [];
  const values = itemValues(q, 0);
  q.answers.forEach((a, n) => {
    if (!String(a.text).trim()) return;
    const r = tryEvaluate(a.text, values);
    if (r.error) issues.push(`Answer formula ${n + 1}: ${r.error}.`);
  });
  for (const d of q.datasets ?? []) {
    if (Number(d.min) > Number(d.max)) issues.push(`{${d.name}}: the minimum is larger than the maximum.`);
    if (d.distribution === 'loguniform' && !(Number(d.min) > 0)) issues.push(`{${d.name}}: a log-uniform range must start above 0.`);
  }
  return issues;
}
