/** Case- and diacritic-insensitive form used by the library filter and the suggestions. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface Suggestion<T> { item: T; start: number; end: number }

/**
 * Up to `limit` items whose title contains the query: titles that start with it first, then ones where it starts a word,
 * then the rest, each group in the given order. `start`/`end` locate the match in the original title (for highlighting).
 */
export function suggest<T extends { title: string }>(items: T[], query: string, limit = 6): Suggestion<T>[] {
  const q = norm(query.trim())
  if (!q) return []
  const hits: (Suggestion<T> & { rank: number })[] = []
  for (const item of items) {
    // Normalise per character so offsets in the folded string map back to the original title.
    let folded = ''
    const at: number[] = []
    for (let i = 0; i < item.title.length; ) {
      const ch = String.fromCodePoint(item.title.codePointAt(i)!)
      for (const c of norm(ch)) { folded += c; at.push(i) }
      i += ch.length
    }
    const s = folded.indexOf(q)
    if (s < 0) continue
    const rank = s === 0 ? 0 : /[^\p{L}\p{N}]/u.test(folded[s - 1]!) ? 1 : 2
    hits.push({ item, start: at[s]!, end: (at[s + q.length - 1] ?? 0) + 1, rank })
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit)
}
