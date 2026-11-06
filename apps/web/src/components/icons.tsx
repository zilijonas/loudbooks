// Icon paths copied from design/Loud Books App.dc.html (lucide geometry, 2 px stroke) so glyphs match the design exactly.
const P = {
  plus: ['M5 12h14', 'M12 5v14'],
  search: ['M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M21 21l-4.3-4.3'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
  left: ['M15 18l-6-6 6-6'],
  right: ['M9 18l6-6-6-6'],
  down: ['M6 9l6 6 6-6'],
  upc: ['M18 15l-6-6-6 6'],
  settings: ['M20 7h-9', 'M14 17H5', 'M17 14a3 3 0 1 0 0 6a3 3 0 1 0 0-6', 'M7 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  check: ['M20 6L9 17l-5-5'],
  play: ['M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z'],
  pause: ['M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M14 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z'],
  back: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  fwd: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  gauge: ['M12 14l4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  pencil: ['M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4Z'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 21h14'],
  up: ['M12 19V5', 'M5 12l7-7 7 7'],
  dn: ['M12 5v14', 'M19 12l-7 7-7-7'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z', 'M12 10a3 3 0 1 0 0 6a3 3 0 1 0 0-6'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  alert: ['M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 16v-4', 'M12 8h.01'],
  wifi: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
  drive: ['M22 12H2', 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z', 'M6 16h.01', 'M10 16h.01'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z', 'M9 12l2 2 4-4'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  addHome: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M8 12h8', 'M12 8v8'],
  music: ['M9 18V5l12-2v13', 'M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6', 'M18 13a3 3 0 1 0 0 6a3 3 0 1 0 0-6'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M9 7a2 2 0 1 0 0 4a2 2 0 1 0 0-4', 'M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
  book: ['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  archive: ['M3 3h18v5H3z', 'M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8', 'M10 12h4'],
  plane: ['M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z'],
} as const

export type IconName = keyof typeof P
const FILLED: IconName[] = ['play', 'pause']

/** Decorative icon; size comes from the wrapping box (`.lb-ic` sets width/height). */
export function Icon({ name }: { name: IconName }) {
  const filled = FILLED.includes(name)
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth={name === 'more' || name === 'grip' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      {P[name].map((d) => <path key={d} d={d} {...(filled ? { fill: 'currentColor', stroke: 'none' } : {})} />)}
    </svg>
  )
}

/** Spinner keeps turning under reduced motion: it carries meaning and always sits beside a text label. */
export function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" data-spin="" aria-hidden="true" className="lb-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="16 100" />
    </svg>
  )
}

/** Sized icon box, the design's `<span style="width:Npx;height:Npx;display:flex">` wrapper. */
export function Ic({ name, size, className }: { name: IconName | 'spin'; size: number; className?: string }) {
  return (
    <span className={className ? `lb-ic ${className}` : 'lb-ic'} style={{ width: size, height: size }}>
      {name === 'spin' ? <Spinner /> : <Icon name={name} />}
    </span>
  )
}
