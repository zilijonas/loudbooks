// Dev-server-only fixture seeder for the screen compare (e2e/tools/screens.mjs). Loaded in the page with
// `import('/loudbooks/e2e/tools/seed.ts')`; never imported by the app. Books mirror FIX in design/Loud Books App.dc.html.
import type { Book, Chapter, MediaAsset, PlaybackProgress, PlaybackSession } from '../../src/domain/models'
import { db } from '../../src/services/db/database'
import { MediaStorage } from '../../src/services/opfs/MediaStorage'

type Fix = { title: string; desc: string; ch: [string, number][]; pos?: number; frac?: number; single?: boolean; parts?: boolean; done?: boolean }
const FIX: Record<string, Fix> = {
  b1: { title: 'Salt & Static', desc: 'A radio operator on a remote salt flat starts hearing a voice between stations. Over one long winter she tries to find out who is calling, and why the voice seems to know her name. Read by the author.', ch: [['Arrival', 31], ['The Salt Office', 42], ['Static on the Line', 38], ['The Long Tide', 41], ['Harbour Lights', 36], ['A Letter Unsent', 44], ['Night Shift', 39], ['Undertow', 40], ['The Radio Room', 37], ['Low Water', 43], ['Signals', 38], ['Weatherglass', 41], ['The Crossing', 35], ['Afterword', 24]], pos: 7420 },
  b2: { title: "The Lighthouse Keeper's Almanac of Small Weather", desc: 'A year of weather reports from a lighthouse at the edge of the map, kept by a keeper who notices everything. Gentle, funny and occasionally very windy.', ch: [['The Almanac Begins', 12], ['January: Hard Frost', 41], ['February: Sea Fret', 38], ['March: Equinox Gales', 40], ['April: Showers, Then Sun', 37], ['May: The Long Light', 39], ['June: Haar', 36], ['July: Thunder Over the Point', 42], ['August: Dog Days', 38], ['September: The Turn', 37], ['October: Spring Tides', 40], ['November: Gale Warnings', 41], ['December: The Dark Weeks', 39], ['On the Correct Interpretation of Fog, With Notes for the Inexperienced Keeper', 44], ['The Logbook', 33], ['Visitors', 31], ['The Relief Boat', 35], ['Lamp Room', 29], ['Small Weather', 34], ['Large Weather', 38], ['Last Entry', 30], ['Afterword', 8]], frac: 0.18 },
  b3: { title: 'North of Nowhere', desc: "Two siblings drive north with a broken radio and a box of their mother's letters.", ch: [['North of Nowhere', 365]], single: true, parts: true, frac: 1, done: true },
  b4: { title: 'A Field Guide to Quiet Rooms', desc: '', ch: [['The Front Door', 28], ['The Reading Room', 34], ['The Attic', 30]], pos: 0 },
  b5: { title: 'Moth Hours', desc: 'Eight short nights on a porch: one lamp, and everything it draws in.', ch: [['Dusk', 34], ['The Lamp', 38], ['First Wings', 36], ['A Gathering', 40], ['Porch Light', 35], ['The Collector', 37], ['Midnight', 33], ['Dawn', 35]], frac: 0.72 },
  b6: { title: 'The Orchard at the End of the Line', desc: 'One long summer in an orchard where the trains stopped running years ago.', ch: [['The Orchard at the End of the Line', 1202]], single: true, frac: 0.05 },
  // Break-UI books.
  long: { title: 'The Extraordinarily Long and Winding Account of a Very Small Lighthouse on a Very Large and Windy Sea', desc: 'x'.repeat(0), ch: [['On the Correct Interpretation of Fog, With Notes for the Inexperienced Keeper and Others', 44], ['B', 20]], frac: 0.4 },
  q: { title: 'Q', desc: '', ch: [['Q', 12]], single: true, pos: 0 },
  huge: { title: 'Twenty Hours of Rain', desc: 'A single twenty-hour file with thirty-minute parts.', ch: [['Twenty Hours of Rain', 1200]], single: true, parts: true, frac: 0.5 },
}
export const MANY = ['b1', 'b2', 'b5', 'b4', 'b6', 'b3']

export interface SeedOptions { books?: string[]; welcome?: boolean; missing?: string[]; sessionBytes?: number }

export async function seed({ books = [], welcome = false, missing = [], sessionBytes = 0 }: SeedOptions) {
  await Promise.all([db.books, db.assets, db.chapters, db.progress, db.sessions, db.settings, db.imports].map((t) => t.clear()))
  if (!welcome) await db.settings.put({ id: 'settings', theme: 'system', locale: 'en', defaultSpeed: 1, generatedPartsPreference: false, schemaVersion: 1, welcomeDone: true })
  const now = Date.now()
  for (const [i, id] of books.entries()) {
    const f = FIX[id]!
    const tot = f.ch.reduce((a, [, m]) => a + m * 60, 0)
    const pos = f.pos ?? Math.round((f.frac ?? 0) * tot)
    const book: Book = { id, title: f.title, description: f.desc, coverAssetId: null, revision: 1, createdAt: now - i * 1000, updatedAt: now, status: f.done ? 'completed' : missing.includes(id) ? 'missing' : 'ready' }
    const assets: MediaAsset[] = f.ch.map(([t, m], j) => ({ id: `${id}-a${j}`, bookId: id, path: `books/${id}/${j}.mp3`, originalFilename: `${String(j + 1).padStart(2, '0')} ${t}.mp3`, container: 'MP3', codec: 'mp3', channels: 2, sampleRate: 44100, duration: m * 60, bytes: Math.round(m * 0.94e6), sha256: '' }))
    let at = 0
    const chapters: Chapter[] = f.parts
      ? Array.from({ length: Math.ceil(tot / 1800) }, (_, j) => ({ id: `${id}-c${j}`, bookId: id, order: j, title: '', globalStart: j * 1800, globalEnd: Math.min(tot, (j + 1) * 1800), kind: 'generated' as const, sourceRanges: [{ assetId: `${id}-a0`, sourceStart: j * 1800, sourceEnd: Math.min(tot, (j + 1) * 1800) }] }))
      : f.ch.map(([t, m], j) => { const c: Chapter = { id: `${id}-c${j}`, bookId: id, order: j, title: t, globalStart: at, globalEnd: at + m * 60, kind: 'imported', sourceRanges: [{ assetId: `${id}-a${j}`, sourceStart: 0, sourceEnd: m * 60 }] }; at += m * 60; return c })
    await db.books.put(book)
    await db.assets.bulkPut(assets)
    await db.chapters.bulkPut(chapters)
    if (pos > 0) {
      const progress: PlaybackProgress = { bookId: id, bookRevision: 1, sourceAssetId: `${id}-a0`, sourceOffset: 0, globalOffset: pos, updatedAt: now - i * 1000, stopReason: null, rewindPending: false }
      await db.progress.put(progress)
    }
  }
  if (sessionBytes) {
    const path = 'sessions/seed.mp4'
    const handle = await new MediaStorage().handle(path, true)
    const w = await handle.createWritable()
    await w.write(new Uint8Array(sessionBytes))
    await w.close()
    const session: PlaybackSession = { id: 'seed', bookId: books[0] ?? 'b1', revision: 1, mode: 'minutes', rate: 1, requestedListeningSeconds: 1800, actualMediaDuration: 1800, outputPath: path, state: 'ended', sourceMap: [], lastObservedPosition: 0 }
    await db.sessions.put(session)
  }
}
