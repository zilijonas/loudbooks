import { useSyncExternalStore } from 'react'

const onlineSub = (cb: () => void) => {
  addEventListener('online', cb)
  addEventListener('offline', cb)
  return () => { removeEventListener('online', cb); removeEventListener('offline', cb) }
}
export const useOnline = () => useSyncExternalStore(onlineSub, () => navigator.onLine, () => true)

/** Opened from the Home Screen / installed app window. */
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** A Safari tab (iOS or macOS): books added here stay out of the installed app. */
export const isSafariTab = () => {
  const ua = navigator.userAgent
  return !isStandalone() && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Android/.test(ua)
}
