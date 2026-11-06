import { act, render } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" content="#FBF4EA">'
  window.matchMedia = ((q: string) => ({ matches: q.includes('dark'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})

function Probe({ onTheme }: { onTheme: (t: ReturnType<typeof useTheme>) => void }) {
  onTheme(useTheme())
  return null
}

it('follows the system, then an explicit choice, and persists it', () => {
  let theme!: ReturnType<typeof useTheme>
  render(<ThemeProvider><Probe onTheme={(t) => (theme = t)} /></ThemeProvider>)
  expect(document.documentElement.dataset.theme).toBe('dark')
  act(() => theme.setPreference('light'))
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#FBF4EA')
  expect(localStorage.getItem('loudbooks:theme')).toBe('light')
})
