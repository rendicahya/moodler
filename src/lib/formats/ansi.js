// Writes text with only the characters of Windows-1252, for programs that turn all others into "?".

const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const isAnsi = (c) => (c >= ' ' && c <= '~') || c === '\t' || c === '\n' || (c >= '\u00a0' && c <= '\u00ff') || EXTRA.has(c);

const pairs = (s) => Object.fromEntries(s.trim().split(/\s+/).map((p) => [[...p][0], [...p].slice(1).join('')]));

// Look the same, so nobody needs to know.
const SAME = pairs("−- ‐- ‑- ‒– ―— ′' ″\" ‵' ʹ' ʼ’ ⁄/ ∕/ ∶: ∣| ∗* ∼~ ∙· ⋅· ‧· ⋯… ●• ∘° ▪• ‣• ◦• ⁃• ◆• ∖\\ ∅Ø ⌀Ø μµ");

// Signs, as they are typed on a keyboard. Arrows have an en dash, which looks more like one.
const SIGNS = pairs(`→–> ⟶–> ➔–> ➜–> ➝–> ➡–> ←<– ⟵<– ⬅<– ↔<–> ⟷<–> ⇒=> ⟹=> ⇐<== ⟸<== ⇔<=> ⟺<=> ⇌<=> ⇄<=> ↦|–> ↑(up) ↓(down) ⬆(up) ⬇(down)
  ≤<= ⩽<= ≥>= ⩾>= ≠!= ≈~= ≅~= ≃~= ≡== ≪<< ≫>> ∓-/+ ∥|| ⊥_|_ ⟨< ⟩> 〈< 〉> ✓[v] ✔[v] ☑[v] ✅[v] ✗[x] ✘[x] ☒[x] ❌[x] ★* ☆*
  ─- │| ┌+ ┐+ └+ ┘+ ├+ ┤+ ┬+ ┴+ ┼+ ═= ║| ╔+ ╗+ ╚+ ╝+ ╠+ ╣+ ╦+ ╩+ ╬+ ▼v ▲^ ►> ▶> ◄< ◀< đd ĐD łl ŁL ıi ħh`);
SIGNS['☐'] = '[ ]';

// Signs that are read as words.
const WORDS = {
  '∞': 'infinity', '√': 'sqrt', '∑': 'sum', '∏': 'product', '∫': 'integral', '∂': 'd', '∇': 'nabla', '∆': 'Delta', '∝': 'proportional to', '∠': 'angle', '△': 'triangle',
  '∈': 'in', '∉': 'not in', '∪': 'union', '∩': 'intersect', '⊂': 'subset of', '⊆': 'subset of or equal to', '⊃': 'superset of', '⊇': 'superset of or equal to',
  '∧': 'AND', '∨': 'OR', '⊕': 'XOR', '∀': 'for all', '∃': 'there exists', '∴': 'therefore', '∵': 'because',
  ϕ: 'phi', ϵ: 'epsilon', ϑ: 'theta', ς: 'sigma',
};
const GREEK = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(' ');
[...'αβγδεζηθικλμνξοπρστυφχψω'].forEach((c, i) => (WORDS[c] ??= GREEK[i]));
[...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'].forEach((c, i) => (WORDS[c] = GREEK[i][0].toUpperCase() + GREEK[i].slice(1)));

const HIDDEN = /[\0-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufe00-\ufe0f\ufeff]/gu;
const SHIFTED = /([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+)|([₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ]+)/u;

const allAnsi = (s) => [...s].every(isAnsi);
const normal = (s) => [...s.normalize('NFKC')].map((c) => SAME[c] ?? c).join('');

/** The closest to one character, as { text, word }, or null. */
function closest(c) {
  // Characters that are made of others: letters in a math font, fractions, ligatures, full-width letters.
  for (const x of new Set([c, normal(c)])) {
    if (x !== c && allAnsi(x)) return { text: /^[①-⑳]$/u.test(c) ? `(${x})` : x, word: false };
    if (WORDS[x]) return { text: WORDS[x], word: true };
    if (SIGNS[x]) return { text: SIGNS[x], word: false };
  }
  // Without the accents that Windows-1252 does not have.
  const bare = c.normalize('NFKD').replace(/\p{M}/gu, '');
  return bare && allAnsi(bare) ? { text: bare, word: false } : null;
}

function convert(s, notes) {
  let out = '';
  // What was written last is a word, which needs a space before a letter or digit.
  let word = false;
  // Words in Greek are not symbols, so they are not spelled letter by letter.
  for (const [c, greek] of s.matchAll(/(\p{Script=Greek}{3,})|./gsu)) {
    if (word && /^[\p{L}\p{N}]/u.test(c)) out += ' ';
    word = false;
    if (allAnsi(c)) {
      out += c;
    } else if (SAME[c]) {
      out += SAME[c];
    } else {
      const t = greek ? null : closest(c);
      if (!t) {
        for (const x of c) if (!isAnsi(x)) notes?.unknown.add(x);
        out += c;
        continue;
      }
      // The space also keeps 1⅓ from becoming 11/3.
      if ((t.word || /^\d+\//.test(t.text)) && /[\p{L}\p{N}]$/u.test(out)) out += ' ';
      out += t.text;
      word = t.word;
      if (t.text.trim()) notes?.changed.set(c, t.text);
    }
  }
  return out;
}

/**
 * Splits text into parts { text, shift }, where `shift` is 'sup' or 'sub' for raised or lowered characters. `notes` gets in
 * `changed` (a Map) what is written another way, and in `unknown` (a Set) the characters that are left as they are.
 */
export function ansiParts(input, notes) {
  let rest = String(input).replace(HIDDEN, '').normalize('NFC');
  const out = [];
  const put = (text, shift = '') => {
    if (!text) return;
    if (out.length && out.at(-1).shift === shift) out.at(-1).text += text;
    else out.push({ text, shift });
  };
  while (rest) {
    const m = SHIFTED.exec(rest);
    put(convert(m ? rest.slice(0, m.index) : rest, notes));
    if (!m) break;
    if (allAnsi(m[0])) put(m[0]);
    else put(normal(m[0]), m[1] ? 'sup' : 'sub');
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
