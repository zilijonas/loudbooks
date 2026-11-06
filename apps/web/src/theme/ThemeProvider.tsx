import { createContext, use, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

const KEY = 'loudbooks:theme'
const THEME_COLOR: Record<Resolved, string> = { light: '#FBF4EA', dark: '#1C1512' }
const dark = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch { /* storage blocked: fall back to system */ }
  return 'system'
}

const systemTheme = (): Resolved => (dark().matches ? 'dark' : 'light')
const subscribe = (cb: () => void) => {
  const mq = dark()
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Always writes a concrete data-theme so the Tailwind `dark:` variant and the tokens agree. */
export function applyTheme(r: Resolved) {
  document.documentElement.dataset.theme = r
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[r])
}

const Ctx = createContext<{ preference: ThemePreference; resolved: Resolved; setPreference: (p: ThemePreference) => void } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState(read)
  const system = useSyncExternalStore(subscribe, systemTheme)
  const resolved = preference === 'system' ? system : preference
  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      if (p === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, p)
    } catch { /* storage blocked: theme still applies for this session */ }
    setPref(p)
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <Ctx value={value}>{children}</Ctx>
}

export function useTheme() {
  const v = use(Ctx)
  if (!v) throw new Error('useTheme must be used inside ThemeProvider')
  return v
}
