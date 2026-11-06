// Temporary stub (LB-7). LB-8 owns this file: MiniPlayer (phone) / PlayerBar (desktop) container.
// The Shell renders it below the page on every route except Welcome, Add/Edit and the Player.
// When it shows a phone mini-player it should set `--lb-dock` on <html> (e.g. 80px) so pages keep their last row reachable.
export function PlayerDock() {
  return null
}
