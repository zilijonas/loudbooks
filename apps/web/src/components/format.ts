// Display formatters, ported from the design prototype so times and sizes read the same everywhere.

/** "6 h 05 min", "41 min". Seconds round to whole minutes; anything above 0 shows at least 1 min. */
export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (m === 60) return `${h + 1} h`
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${Math.max(m, sec > 0 ? 1 : 0)} min`
}

/** "12:40", "1:02:09". */
export function formatClock(sec: number): string {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`
}

/** "1.25×". */
export const formatSpeed = (v: number) => `${+v.toFixed(2)}×`

/** "270 MB", "1.1 GB" (decimal units, like the OS shows). */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1e6
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}
