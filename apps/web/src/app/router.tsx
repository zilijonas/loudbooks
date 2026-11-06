import { createHashRouter } from 'react-router'
import { Placeholder } from '../pages/Placeholder'
import { ErrorFallback } from './ErrorFallback'
import { Shell } from './Shell'

// Routes from design/handoff/screen-map.md. Overlays (Send, sheets, dialogs) are not routes.
export const routes = [
  { path: 'welcome', route: 'welcome', title: 'welcome.tagline' },
  { index: true, route: 'library', title: 'common.library' },
  { path: 'add', route: 'add', title: 'form.addTitle' },
  { path: 'book/:id/edit', route: 'edit', title: 'form.editTitle' },
  { path: 'book/:id', route: 'details', title: 'details.chapters' },
  { path: 'player', route: 'player', title: 'player.nowPlaying' },
  { path: 'receive', route: 'receive', title: 'receive.title' },
  { path: 'settings', route: 'settings', title: 'settings.title' },
] as const

// Dev-only component gallery: the DEV check is statically false in production, so the chunk is never built or linked.
const devRoutes = import.meta.env.DEV
  ? [{ path: '__gallery', lazy: async () => ({ Component: (await import('../pages/dev-gallery/Gallery')).Gallery }) }]
  : []

export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    errorElement: <ErrorFallback />,
    children: [
      ...routes.map((r) =>
        'index' in r
          ? { index: true, element: <Placeholder route={r.route} title={r.title} /> }
          : { path: r.path, element: <Placeholder route={r.route} title={r.title} /> },
      ),
      ...devRoutes,
    ],
  },
])
