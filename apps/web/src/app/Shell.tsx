import { Outlet } from 'react-router'

/** App shell. Sidebar, mini-player and update prompt land here in the component and screen tasks. */
export function Shell() {
  return (
    <div className="min-h-dvh bg-bg font-ui text-text">
      <Outlet />
    </div>
  )
}
