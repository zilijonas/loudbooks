import { t, type MessageKey } from '../i18n'

/** Stand-in for a screen that a later task builds. Title comes from the design strings. */
export function Placeholder({ route, title }: { route: string; title: MessageKey }) {
  return (
    <main data-route={route} className="p-6">
      <h1 className="font-display text-title-l">{t(title)}</h1>
    </main>
  )
}
