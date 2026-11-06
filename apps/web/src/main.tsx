import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ErrorBoundary } from './app/ErrorBoundary'
import { router } from './app/router'
import { initPlayback } from './features/playback/api'
import { ThemeProvider } from './theme/ThemeProvider'
import './styles/globals.css'

// The audio element and session restore live above the router: navigation never touches them.
initPlayback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
