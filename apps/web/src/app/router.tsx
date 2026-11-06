import { createHashRouter } from 'react-router'
import { lazy, Suspense } from 'react'
import { BookFormPage } from '../pages/book-form/BookFormPage'
import { DetailsPage } from '../pages/details/DetailsPage'
import { LibraryPage } from '../pages/library/LibraryPage'
import { Placeholder } from '../pages/Placeholder'
import { PlayerPage } from '../pages/player/PlayerPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { WelcomePage } from '../pages/welcome/WelcomePage'
import { ErrorFallback } from './ErrorFallback'
import { Shell } from './Shell'

const Harness = import.meta.env.VITE_DATA_HARNESS === '1' ? lazy(() => import('../../e2e/ImportHarness')) : null
// Dev-only component gallery: the DEV check is statically false in production, so the chunk is never built or linked.
const devRoutes = import.meta.env.DEV
  ? [{ path: '__gallery', lazy: async () => ({ Component: (await import('../pages/dev-gallery/Gallery')).Gallery }) }]
  : []

// Dev-only player presets for side-by-side parity screenshots (e2e/tools/compare.mjs).
const devPlayer = import.meta.env.DEV
  ? [{ path: '/__player/:preset', lazy: async () => ({ Component: (await import('../pages/player/DevPlayerFixture')).DevPlayerFixture }) }]
  : []

// Routes from design/handoff/screen-map.md. Overlays (Send, sheets, dialogs) are not routes, so Back closes them.
export const router = createHashRouter([
  ...(Harness ? [{ path: '/__harness/import', element: <Suspense><Harness /></Suspense> }] : []),
  ...devPlayer,
  {
    path: '/',
    element: <Shell />,
    errorElement: <ErrorFallback />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: 'welcome', element: <WelcomePage /> },
      { path: 'add', element: <BookFormPage mode="add" /> },
      { path: 'book/:id/edit', element: <BookFormPage mode="edit" /> },
      { path: 'book/:id', element: <DetailsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // LB-9 registers Receive.
      { path: 'player', element: <PlayerPage /> },
      { path: 'receive', element: <Placeholder route="receive" title="receive.title" /> },
      ...devRoutes,
    ],
  },
])
