// Answer checking: forgiving about case / punctuation / "ae" for "ä" (with a gentle note),
// strict about the German itself.

const PUNCT = /[.,!?;:"„“”‚‘’()«»–—]/g;
export const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(PUNCT, '').replace(/\s+/g, ' ').trim();
export const fold = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const squash = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

export function lev(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/**
 * Compare a typed answer with the accepted answers.
 * → { ok, note: null | 'case' | 'umlaut', close: bool, best: string }
 */
export function compareTyped(given, accepted) {
  const g = squash(given);
  const list = [].concat(accepted);
  for (const e of list) if (g === squash(e)) return { ok: true, note: null, close: false, best: e };
  for (const e of list) {
    if (norm(g) === norm(e)) {
      const capital = /^\p{Lu}/u.test(e) && !/^\p{Lu}/u.test(g);
      return { ok: true, note: capital ? 'case' : null, close: false, best: e };
    }
  }
  for (const e of list) if (fold(norm(g)) === fold(norm(e))) return { ok: true, note: 'umlaut', close: false, best: e };
  let best = list[0]; let bd = 99;
  for (const e of list) { const d = lev(fold(norm(g)), fold(norm(e))); if (d < bd) { bd = d; best = e; } }
  return { ok: false, note: null, close: bd <= 1 && norm(best).length >= 4, best };
}

/** Word-level alignment (LCS) → [{w, st: 'ok'|'wrong'|'missing'}] over the expected words, plus extras. */
export function diffWords(given, expected) {
  const a = norm(fold(given)).split(' ').filter(Boolean);
  const eWords = squash(expected).split(' ');
  const b = eWords.map((w) => norm(fold(w)));
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Set();
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { hit.add(j); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const out = eWords.map((w, k) => ({ w, st: hit.has(k) ? 'ok' : 'missing' }));
  const score = m ? hit.size / Math.max(m, n) : 0;
  return { words: out, score };
}

/** Compare two token sequences ignoring case. */
export const sameSeq = (a, b) => a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]) && (norm(x) !== '' || x === b[i]));
export const anySeq = (seq, list) => list.some((l) => sameSeq(seq, l));
