// Generated cover art, ported from `artOf` in design/Loud Books App.dc.html.
// FNV-1a of the trimmed, lower-cased title → 5 palettes × 3 layouts; layout 2 shows initials ("F.G.").

export interface Art {
  bg: string
  fg: string
  accent: string
  border: string
  justify: 'flex-start' | 'flex-end' | 'space-between'
  display: string
  /** Title size in container-query units, so one cover works from 38 px to 380 px. */
  fs: string
  author: string
}

const PAL = [
  { bg: '#FF6B4A', fg: '#2A1E17', accent: '#2A1E17', border: '0' },
  { bg: '#2A1E17', fg: '#FBF4EA', accent: '#FFC93C', border: '0' },
  { bg: '#FFC93C', fg: '#2A1E17', accent: '#C23E22', border: '0' },
  { bg: '#FFFBF5', fg: '#2A1E17', accent: '#FF6B4A', border: '2px solid #2A1E17' },
  { bg: '#93301C', fg: '#FBF4EA', accent: '#FF9878', border: '0' },
] as const
const LAY = ['flex-start', 'flex-end', 'space-between'] as const

const fnv = (s: string) => {
  let x = 0x811c9dc5
  for (const c of s) {
    x ^= c.codePointAt(0)!
    x = Math.imul(x, 0x01000193)
  }
  return x >>> 0
}

const steps = (n: number) => (n <= 12 ? 21 : n <= 24 ? 16 : n <= 40 ? 12.5 : 10)

/** The design's size steps by title length, shrunk just enough that the longest word fits the cover (the title breaks anywhere, so a 7-letter word at 21cqw would split mid-word). */
export const titleSize = (title: string) => {
  const longest = Math.max(1, ...title.split(/\s+/).map((w) => [...w].length))
  return `${Math.max(8, Math.min(steps([...title].length), 76 / (longest * 0.56)))}cqw`
}

export function artOf(title: string): Art {
  const t = title.trim() || 'Untitled'
  const x = fnv(t.toLowerCase())
  const p = PAL[x % 5]!
  const li = (x >>> 8) % 3
  const ini = t
    .replace(/^(the|a|an)\s+/i, '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w.match(/[\p{L}\p{N}]/u)![0]!.toUpperCase())
  const mono = li === 2 && ini.length > 0
  return { ...p, justify: LAY[li]!, display: mono ? `${ini.join('.')}.` : t, fs: mono ? '30cqw' : titleSize(t), author: mono ? t : '' }
}
