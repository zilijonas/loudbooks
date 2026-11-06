// UI state of the player. Written only by the controller; components read it through usePlayer selectors.
import { create } from 'zustand'
import type { TimerSetting } from '../../components/player/Playback'
import type { Book, Chapter, PlaybackSession } from '../../domain/models'
import type { BookTimeline, SessionPart, SessionPlan } from '../../domain/session-planner'
import type { PlayerState } from './machine'

export interface AttachedFile {
  plan: SessionPlan
  /** Actual packet-boundary map of the file. */
  sourceMap: SessionPart[]
  /** Media seconds of the file. */
  duration: number
  /** Storage path (MediaStorage-relative): a session file, or the book's own single asset. */
  path: string
  /** Null when the book's own file plays directly. */
  session: PlaybackSession | null
}

export interface PlayerStore {
  state: PlayerState
  book: Book | null
  chapters: Chapter[]
  timeline: BookTimeline | null
  cover: Blob | null
  rate: number
  timer: TimerSetting
  file: AttachedFile | null
  /** Plan being prepared (summary text, and the base for taps while a rebuild runs). */
  pending: SessionPlan | null
  /** audio.currentTime of the attached file. */
  time: number
  /** Global book position shown when no file is attached. */
  position: number
  toast: { id: number; text: string } | null
  /** Startup restore finished: the player route may decide there is no book. */
  restored: boolean
}

export const usePlayerStore = create<PlayerStore>(() => ({
  state: { status: 'idle', bookId: null },
  book: null,
  chapters: [],
  timeline: null,
  cover: null,
  rate: 1,
  timer: { mode: 'minutes', minutes: 30 },
  file: null,
  pending: null,
  time: 0,
  position: 0,
  toast: null,
  restored: false,
}))
