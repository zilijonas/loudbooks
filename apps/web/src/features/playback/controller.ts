// AudioController: the listening-session lifecycle around the single audio element (spec 01 §8-§10, plan §6).
// Plan -> reuse or compile ONE file -> OPFS File -> blob URL -> audio.src. The file ending is the stop; nothing here
// starts another file on 'ended', and the countdown is the media position, never a timer.
import type { TimerSetting } from '../../components/player/Playback'
import type { MediaAsset, PlaybackSession } from '../../domain/models'
import { globalToSession, sessionToGlobal, stopState } from '../../domain/progress-tracker'
import { bookDuration, planSession, type BookTimeline, type SessionMode, type SessionPlan, type StopReason } from '../../domain/session-planner'
import { t } from '../../i18n'
import { libraryRepository as repo } from '../../services/db/LibraryRepository'
import { audioElement, whenLoaded } from '../../services/audio/audio-element'
import { compileInWorker } from '../../services/media/media-client'
import { setMediaHandlers, setMediaMetadata, setMediaPlaybackState, setMediaPosition } from '../../services/media-session/media-session'
import { MediaStorage } from '../../services/opfs/MediaStorage'
import { coverPath } from '../library/LibraryCommands'
import { StorageMaintenance } from '../storage/StorageMaintenance'
import { fitChapterMode, hasFile, reduce, replan, startPoint, timerMode, type PlayerEvent, type RebuildReason } from './machine'
import { usePlayerStore, type AttachedFile, type PlayerStore } from './store'
import { progressAt, toTimeline } from './timeline'

const storage = new MediaStorage()
const db = repo.database
const get = usePlayerStore.getState
const set = usePlayerStore.setState
const dispatch = (e: PlayerEvent) => set((s) => ({ state: reduce(s.state, e) }))
const audio = () => audioElement()

// Planned file ends land on packet boundaries: anything this close counts as the same point.
const END_SLACK = 0.5
const CHECKPOINT_MS = 5000

let assets = new Map<string, MediaAsset>()
let prepareAbort: AbortController | null = null
let preparing: Promise<void> | null = null
let preparationGeneration = 0
let selectionGeneration = 0
let rebuildResume = false
let objectUrl: string | null = null
let expectPause = false
let lastCheckpoint = 0
let toastId = 0
let writes: Promise<unknown> = Promise.resolve()

// Paths in use by playback or an in-flight preparation, counted (a file can be both playing and a compile source).
const active = new Map<string, number>()
const hold = (p: string) => active.set(p, (active.get(p) ?? 0) + 1)
const release = (p: string) => {
  const n = (active.get(p) ?? 0) - 1
  if (n > 0) active.set(p, n)
  else active.delete(p)
}

/** Guard for LibraryCommands / StorageMaintenance / ImportCoordinator.recover: true while playback needs the path. */
export function isActivePath(path: string): boolean {
  for (const p of active.keys()) if (path === p || path.startsWith(`${p}/`)) return true
  return false
}

/** Serialised metadata writes: a stop record is never overtaken by an older checkpoint. */
function queue(task: () => Promise<unknown>) {
  writes = writes.then(task).catch((error) => console.error('[player] write failed', error))
  return writes
}

const cleanup = () => void writes.then(() => new StorageMaintenance(isActivePath).clearTemporary()).catch((error) => console.error('[player] cleanup failed', error))

export function currentPosition(s: PlayerStore = get()): number {
  return s.file && s.timeline ? sessionToGlobal(s.timeline, s.file.sourceMap, s.time) : s.position
}

function showToast(text: string) {
  const id = ++toastId
  set({ toast: { id, text } })
  setTimeout(() => { if (get().toast?.id === id) set({ toast: null }) }, 4000)
}

const modeString = (m: SessionMode) => (m.kind === 'chapterEnd' ? `chapterEnd:${m.count}` : m.kind)

function sessionMode(s: PlaybackSession): SessionMode {
  if (s.mode === 'duration' && s.requestedListeningSeconds) return { kind: 'duration', seconds: s.requestedListeningSeconds }
  const count = Number(s.mode.split(':')[1])
  return count === 1 || count === 2 || count === 3 ? { kind: 'chapterEnd', count } : { kind: 'none' }
}

function timerOf(m: SessionMode): TimerSetting {
  if (m.kind === 'duration') return { mode: 'minutes', minutes: Math.max(1, Math.round(m.seconds / 60)) }
  return m.kind === 'chapterEnd' ? { mode: 'chapters', count: m.count } : { mode: 'off' }
}

/** The plan a stored session file realises (used when restoring it after a reload). */
function planOf(timeline: BookTimeline, s: PlaybackSession): SessionPlan {
  const mode = sessionMode(s)
  const globalStart = sessionToGlobal(timeline, s.sourceMap, 0)
  const globalEnd = sessionToGlobal(timeline, s.sourceMap, s.actualMediaDuration)
  const stopReason: StopReason = globalEnd >= bookDuration(timeline) - END_SLACK ? 'bookEnd' : mode.kind === 'duration' ? 'timer' : mode.kind === 'chapterEnd' ? 'chapterEnd' : 'bookEnd'
  return { bookId: s.bookId, revision: s.revision, mode, rate: s.rate, globalStart, globalEnd, parts: s.sourceMap, mediaDuration: s.actualMediaDuration, listeningDuration: s.actualMediaDuration / s.rate, stopReason, unavailableChapterEnds: [] }
}

async function loadBook(bookId: string) {
  const [book, chapters, rows, progress] = await Promise.all([
    db.books.get(bookId),
    db.chapters.where('bookId').equals(bookId).sortBy('order'),
    db.assets.where('bookId').equals(bookId).toArray(),
    db.progress.get(bookId),
  ])
  if (!book) throw new Error(`Book ${bookId} not found`)
  assets = new Map(rows.map((a) => [a.id, a]))
  const timeline = toTimeline(book, chapters, rows)
  const cover = book.coverAssetId ? await storage.read(coverPath(book.id, book.coverAssetId)).catch(() => null) : null
  set({ book, chapters, timeline, cover })
  void setMediaMetadata(book.title, cover)
  return { book, timeline, progress }
}

// ---- files

function retire(session: PlaybackSession | null) {
  if (session) queue(() => repo.saveSession({ ...session, state: 'inactive' }))
}

/** Stops and unhooks the attached file; its URL is revoked only after the element let go of it. */
function detach() {
  const old = get().file
  set({ file: null })
  const a = audio()
  a.pause()
  a.removeAttribute('src')
  a.load()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
  if (old) release(old.path)
  return old
}

async function attach(next: AttachedFile, blob: Blob, at: number) {
  const old = detach()
  if (old?.session && old.session.id !== next.session?.id) retire(old.session)
  hold(next.path)
  const a = audio()
  objectUrl = URL.createObjectURL(blob)
  a.src = objectUrl
  await whenLoaded(a)
  a.currentTime = at
  a.defaultPlaybackRate = a.playbackRate = get().rate
  set({ file: { ...next, duration: Number.isFinite(a.duration) ? a.duration : next.duration }, time: at, pending: null })
  setMediaPosition(a.duration, at, a.playbackRate)
}

/** A stored session file that stops exactly where the plan stops and contains its start. */
async function reusable(plan: SessionPlan, timeline: BookTimeline) {
  const rows = await db.sessions.where('bookId').equals(plan.bookId).toArray()
  for (const s of rows) {
    if (s.revision !== plan.revision || !s.outputPath || !s.sourceMap.length || ['error', 'preparing', 'rebuilding'].includes(s.state)) continue
    if (globalToSession(timeline, s.sourceMap, plan.globalStart) === null) continue
    if (Math.abs(sessionToGlobal(timeline, s.sourceMap, s.actualMediaDuration) - plan.globalEnd) > END_SLACK) continue
    const blob = await storage.read(s.outputPath).catch(() => null)
    if (blob) return { file: { plan, sourceMap: s.sourceMap, duration: s.actualMediaDuration, path: s.outputPath, session: s }, blob }
  }
  return null
}

async function compile(plan: SessionPlan, signal: AbortSignal) {
  const id = crypto.randomUUID()
  const folder = `sessions/${id}`
  const sources = plan.parts.map((p) => assets.get(p.assetId)!.path)
  hold(folder)
  sources.forEach(hold)
  try {
    const result = await compileInWorker(
      { sessionId: id, parts: plan.parts },
      {
        getFile: (assetId) => storage.read(assets.get(assetId)!.path),
        signal,
        onProgress: (p) => dispatch({ type: 'phase', phase: p.phase }),
      },
    )
    const session: PlaybackSession = {
      id,
      bookId: plan.bookId,
      revision: plan.revision,
      mode: modeString(plan.mode),
      rate: plan.rate,
      requestedListeningSeconds: plan.mode.kind === 'duration' ? plan.mode.seconds : null,
      actualMediaDuration: result.actualMediaDuration,
      // The compiler reports the OPFS path from the root; the library stores paths under loud-books/v1.
      outputPath: result.outputPath.replace(/^loud-books\/v1\//, ''),
      state: 'preparing',
      sourceMap: result.sourceMap,
      lastObservedPosition: 0,
      // No timer through the book end: the continuous-book file, listed as a removable cache in Settings.
      kind: plan.mode.kind === 'none' ? 'continuous-cache' : 'session',
    }
    await repo.saveSession(session)
    return { file: { plan, sourceMap: session.sourceMap, duration: session.actualMediaDuration, path: session.outputPath, session }, blob: await storage.read(session.outputPath) }
  } finally {
    release(folder)
    sources.forEach(release)
  }
}

async function obtain(plan: SessionPlan, timeline: BookTimeline, signal: AbortSignal) {
  // The rest of a single-file book without a timer: the book's own file already is that session (spec 01 §8 step 2).
  const only = plan.parts.length === 1 && plan.stopReason === 'bookEnd' ? assets.get(plan.parts[0]!.assetId) : undefined
  if (only) {
    const file: AttachedFile = { plan, sourceMap: [{ assetId: only.id, sourceStart: 0, sourceEnd: only.duration, sessionStart: 0 }], duration: only.duration, path: only.path, session: null }
    return { file, blob: await storage.read(only.path), compiled: false }
  }
  const reused = await reusable(plan, timeline)
  return reused ? { ...reused, compiled: false } : { ...(await compile(plan, signal)), compiled: true }
}

async function playAudio() {
  try {
    await audio().play()
  } catch (error) {
    const name = (error as DOMException).name
    if (name === 'NotAllowedError') dispatch({ type: 'blocked' })
    else if (name !== 'AbortError') {
      console.error('[player] play failed', error)
      dispatch({ type: 'failed' })
    }
  }
}

function prepare(plan: SessionPlan, reason: 'start' | RebuildReason, resume: boolean) {
  const previous = preparing
  const generation = ++preparationGeneration
  const work = (async () => { if (previous) { prepareAbort?.abort(); await previous } if (generation === preparationGeneration) await prepareFile(plan, reason, resume) })()
  preparing = work
  void work.then(() => { if (preparing === work) preparing = null }, () => { if (preparing === work) preparing = null })
  return work
}

async function prepareFile(plan: SessionPlan, reason: 'start' | RebuildReason, resume: boolean) {
  prepareAbort?.abort()
  const ctrl = new AbortController()
  prepareAbort = ctrl
  dispatch(reason === 'start' ? { type: 'prepare', bookId: plan.bookId } : { type: 'rebuild', reason })
  set({ pending: plan })
  const timeline = get().timeline!
  let compiled: boolean
  try {
    let file: AttachedFile, blob: Blob
    ({ file, blob, compiled } = await obtain(plan, timeline, ctrl.signal))
    if (ctrl.signal.aborted) return retire(file.session)
    await attach(file, blob, globalToSession(timeline, file.sourceMap, plan.globalStart) ?? 0)
  } catch (error) {
    if (ctrl.signal.aborted) return
    console.error('[player] preparation failed', error)
    set({ pending: null })
    dispatch({ type: 'failed' })
    return
  } finally {
    if (prepareAbort === ctrl) prepareAbort = null
  }
  if (ctrl.signal.aborted) return
  cleanup()
  // After trimming/merging a new file the listener starts it (spinner -> Play); an existing file plays at once.
  if (resume && !compiled) await playAudio()
  else dispatch({ type: 'loaded' })
}

// ---- checkpoints and stops

function checkpoint(stopReason: 'pause' | null) {
  const s = get()
  if (!s.file || !s.timeline || s.state.status === 'ended') return
  const { timeline, file, rate } = s
  const a = audio()
  const time = a.currentTime
  const paused = a.paused
  lastCheckpoint = performance.now()
  queue(async () => {
    await repo.saveProgress(progressAt(timeline, sessionToGlobal(timeline, file.sourceMap, time), stopReason, false))
    if (file.session) await repo.saveSession({ ...file.session, state: paused ? 'paused' : 'playing', lastObservedPosition: time, rate })
  })
}

function onEnded() {
  const s = get()
  if (s.state.status !== 'playing' || !s.file || !s.timeline || !s.book) return
  const { book, file, timeline } = s
  const stop = file.plan.stopReason
  dispatch({ type: 'ended', stop })
  setMediaPlaybackState('paused')
  const next = stopState(timeline, stop, file.plan.globalEnd)
  queue(async () => {
    await repo.saveProgress(progressAt(timeline, next.position, stop, next.rewindPending))
    if (file.session) await repo.saveSession({ ...file.session, state: 'ended', lastObservedPosition: audio().currentTime })
    if (next.completed) await repo.updateBook(book.id, { status: 'completed' })
  })
}

/** Back from the background: trust the element, not our last belief. */
function reconcile() {
  const s = get()
  if (!s.file) return
  const a = audio()
  set({ time: a.currentTime })
  if (s.state.status === 'playing' && a.paused) {
    if (a.ended) onEnded()
    else dispatch({ type: 'interrupted' })
  }
}

// ---- commands

/** `quiet`: no rewind / next-chapter toast (a timer change restarts preparation; the toast would cover the spinner). */
export async function startListening(bookId: string, chapterId?: string, quiet = false) {
  const s = get()
  if (s.book?.id === bookId && !chapterId) {
    if (hasFile(s.state)) return s.state.status === 'playing' ? undefined : playAudio()
    if (s.state.status === 'preparing' || s.state.status === 'rebuilding') return
  }
  const generation = ++selectionGeneration
  prepareAbort?.abort()
  checkpoint('pause')
  retire(detach()?.session ?? null)
  // Busy from the tap on (spinner, not a Play button), so loading the book never shows a tappable gap.
  dispatch({ type: 'prepare', bookId })
  try {
    await writes
    const { book, timeline, progress } = await loadBook(bookId)
    if (generation !== selectionGeneration) return
    const chapter = chapterId ? get().chapters.find((c) => c.id === chapterId) : undefined
    const start = startPoint(progress, book.status === 'completed', chapter?.globalStart)
    const position = start.position >= bookDuration(timeline) - END_SLACK ? 0 : start.position
    const notice = start.notice
    if (notice && !quiet) showToast(t(notice === 'rewind' ? 'player.rewindToast' : 'player.nextChapterToast'))
    // The rewind / next-chapter rule is spent the moment this session starts from it.
    queue(async () => {
      await repo.saveProgress(progressAt(timeline, position, 'pause', false))
      if (book.status === 'completed') await repo.updateBook(book.id, { status: 'ready' })
    })
    set({ position, time: 0 })
    const { timer, rate } = get()
    await prepare(planSession(timeline, position, fitChapterMode(timeline, position, timerMode(timer)), rate), 'start', true)
  } catch (error) {
    console.error('[player] start failed', error)
    dispatch({ type: 'failed' })
  }
}

/**
 * Pauses and lets go of the attached file and any preparation, so the book can be edited, replaced or deleted
 * (`pause()` keeps the file attached, and LibraryCommands refuse active files). The position is saved first.
 * `forget`: the book is about to disappear, so the player drops it too.
 */
export async function stopListening(forget = false) {
  const s = get()
  prepareAbort?.abort()
  prepareAbort = null
  checkpoint('pause')
  set({ pending: null, position: currentPosition(s) })
  retire(detach()?.session ?? null)
  if (forget) set({ book: null, chapters: [], timeline: null, cover: null })
  dispatch({ type: 'select', bookId: forget ? null : s.book?.id ?? null })
  await writes
}

export function pause() {
  const a = audio()
  if (a.paused) return
  expectPause = true
  a.pause()
}

export async function releaseBook(bookId: string) {
  if (!isBookActive(bookId) && get().state.bookId !== bookId) return
  selectionGeneration++
  preparationGeneration++
  prepareAbort?.abort()
  await preparing
  pause()
  checkpoint('pause')
  retire(detach()?.session ?? null)
  set({ pending: null })
  dispatch({ type: 'select', bookId })
  setMediaPlaybackState('paused')
  await writes
}

export function togglePlay() {
  const s = get()
  if (s.state.status === 'playing') return pause()
  if (hasFile(s.state)) return void playAudio()
  if (s.state.status === 'preparing' || s.state.status === 'rebuilding') return
  if (s.book) void startListening(s.book.id)
}

export function cancelPreparation() {
  prepareAbort?.abort()
  prepareAbort = null
  set({ pending: null })
  dispatch({ type: 'cancelled', hasFile: !!get().file })
}

async function rebuild(reason: RebuildReason, change: { position?: number; rate?: number; mode?: SessionMode }) {
  const s = get()
  if (!s.file || !s.timeline) return
  const rebuilding = s.state.status === 'rebuilding'
  if (!rebuilding) rebuildResume = s.state.status === 'playing'
  pause()
  const position = change.position ?? (rebuilding && s.pending ? s.pending.globalStart : currentPosition(s))
  const a = audio()
  // The budget comes from the file still attached: (its end - where it stopped) / its rate.
  const plan = replan(s.timeline, { mode: s.file.plan.mode, rate: s.file.plan.rate, duration: s.file.duration, currentTime: a.currentTime }, { position, rate: change.rate, mode: change.mode })
  if (!plan) return rebuildResume ? playAudio() : undefined
  await prepare(plan, reason, rebuildResume || reason === 'timer')
}

const canChange = (s: PlayerStore) => !!s.file && (hasFile(s.state) || s.state.status === 'rebuilding')

/** Move to a global book position. Inside the prepared file and not a duration session: a plain seek. */
export function seekTo(target: number) {
  const s = get()
  if (!s.timeline || !s.book || s.state.status === 'preparing') return
  const position = Math.min(Math.max(0, target), bookDuration(s.timeline) - END_SLACK)
  if (!canChange(s)) {
    // Nothing playable attached: move the saved place; the next Play starts there.
    if (s.state.status === 'ended') {
      detach()
      dispatch({ type: 'select', bookId: s.book.id })
    }
    set({ position })
    queue(() => repo.saveProgress(progressAt(s.timeline!, position, 'pause', false)))
    return
  }
  if (s.state.status !== 'rebuilding' && s.file!.plan.mode.kind !== 'duration') {
    const time = globalToSession(s.timeline, s.file!.sourceMap, position)
    if (time !== null && time < s.file!.duration - END_SLACK) {
      audio().currentTime = time
      set({ time })
      return
    }
  }
  void rebuild('position', { position })
}

export function seekBy(delta: number) {
  const s = get()
  seekTo((s.state.status === 'rebuilding' && s.pending ? s.pending.globalStart : currentPosition(s)) + delta)
}

export function setRate(rate: number) {
  const s = get()
  if (rate === s.rate) return
  set({ rate })
  if (canChange(s) && s.file!.plan.mode.kind === 'duration') return void rebuild('speed', { rate })
  // The stop point is a place in the book, not a listening time: the same file just plays faster.
  const a = audio()
  a.defaultPlaybackRate = a.playbackRate = rate
}

export function setTimer(timer: TimerSetting) {
  const s = get()
  set({ timer })
  if (canChange(s)) return void rebuild('timer', { mode: timerMode(timer) })
  // First preparation in flight: "No timer" cancels it, anything else restarts it with the new stop point.
  if (s.state.status === 'preparing') {
    cancelPreparation()
    if (timer.mode === 'off') return
  }
  if (s.book) void startListening(s.book.id, undefined, true)
}

export function jumpToChapter(chapterId: string) {
  const s = get()
  const chapter = s.chapters.find((c) => c.id === chapterId)
  if (!chapter || !s.book) return
  if (canChange(s)) return seekTo(chapter.globalStart)
  void startListening(s.book.id, chapterId)
}

export function openPlayer() {
  window.location.hash = '#/player'
}

export const isBookActive = (bookId: string) => get().book?.id === bookId

/** The book is loaded and audio is (or is about to be) coming out: what the "playing now" warnings mean. */
export const isBookPlaying = (bookId: string) => isBookActive(bookId) && ['playing', 'preparing', 'rebuilding'].includes(get().state.status)

// ---- startup

/** Restores the last confirmed place: the paused session file if it still covers it, else just the position. */
async function restore() {
  const last = (await db.progress.toArray()).sort((x, y) => y.updatedAt - x.updatedAt)[0]
  if (!last) return
  const { book, timeline, progress } = await loadBook(last.bookId)
  const position = Math.min(progress?.globalOffset ?? 0, bookDuration(timeline))
  set({ state: { status: 'idle', bookId: book.id }, position })
  // A confirmed stop resumes by its rule on the next Play, not from an old file.
  if (!progress || (progress.stopReason && progress.stopReason !== 'pause')) return
  const sessions = await db.sessions.where('bookId').equals(book.id).toArray()
  for (const session of sessions) {
    if (session.revision !== book.revision || !['playing', 'paused'].includes(session.state)) continue
    const at = globalToSession(timeline, session.sourceMap, position)
    if (at === null || at >= session.actualMediaDuration - END_SLACK) continue
    const blob = await storage.read(session.outputPath).catch(() => null)
    if (!blob) continue
    const plan = planOf(timeline, session)
    set({ rate: session.rate, timer: timerOf(plan.mode) })
    await attach({ plan, sourceMap: session.sourceMap, duration: session.actualMediaDuration, path: session.outputPath, session }, blob, at)
    dispatch({ type: 'loaded' })
    return
  }
}

let started = false

/** Once per page, before the router renders: wire the element, reconcile, restore, then clean up. */
export function initPlayback() {
  if (started) return
  started = true
  const a = audio()
  const mediaPosition = () => {
    const f = get().file
    if (f) setMediaPosition(f.duration, a.currentTime, a.playbackRate)
  }
  const stopKind = () => (a.paused ? 'pause' : null)
  a.addEventListener('playing', () => {
    dispatch({ type: 'playing' })
    setMediaPlaybackState('playing')
    checkpoint(null)
    mediaPosition()
  })
  a.addEventListener('pause', () => {
    // A file end pauses first; 'ended' handles it. A detached source is not a pause of the session.
    if (a.ended || !get().file) return
    dispatch({ type: expectPause ? 'paused' : 'interrupted' })
    expectPause = false
    setMediaPlaybackState('paused')
    checkpoint('pause')
  })
  a.addEventListener('timeupdate', () => {
    if (!get().file) return
    set({ time: a.currentTime })
    if (!a.paused && performance.now() - lastCheckpoint > CHECKPOINT_MS) {
      checkpoint(null)
      mediaPosition()
    }
  })
  a.addEventListener('seeked', () => {
    if (!get().file) return
    set({ time: a.currentTime })
    checkpoint(stopKind())
    mediaPosition()
  })
  a.addEventListener('ratechange', () => {
    checkpoint(stopKind())
    mediaPosition()
  })
  a.addEventListener('ended', onEnded)
  a.addEventListener('error', () => {
    if (get().file && a.getAttribute('src')) dispatch({ type: 'failed' })
  })
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? checkpoint(stopKind()) : reconcile()))
  window.addEventListener('pagehide', () => checkpoint(stopKind()))
  setMediaHandlers({
    play: () => { if (get().state.status !== 'playing') togglePlay() },
    pause,
    // Lock screen: move inside the prepared file only; its end stays the stop point (spec 01 §9).
    seekBy: (d) => {
      const f = get().file
      if (f) a.currentTime = Math.min(Math.max(0, a.currentTime + d), f.duration)
    },
  })
  void (async () => {
    try {
      await restore()
    } catch (error) {
      console.error('[player] restore failed', error)
    } finally {
      set({ restored: true })
    }
    // Only after the live state is known: everything not attached or protected is temporary.
    const keep = get().file?.session?.id
    const stale = (await db.sessions.toArray()).filter((s) => s.id !== keep && ['playing', 'paused', 'preparing', 'rebuilding'].includes(s.state))
    for (const s of stale) queue(() => repo.saveSession({ ...s, state: 'inactive' }))
    cleanup()
  })()
}
