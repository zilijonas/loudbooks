import { useLiveQuery } from 'dexie-react-hooks'
import type { Settings } from '../../domain/models'
import { libraryRepository } from '../../services/db/LibraryRepository'
import { db } from '../../services/db/database'

const DEFAULTS: Settings = { id: 'settings', theme: 'system', locale: 'en', defaultSpeed: 1, generatedPartsPreference: false, schemaVersion: 1 }

/** `undefined` while loading, `null` when nothing was saved yet (first launch). */
export const useAppSettings = () => useLiveQuery(async () => (await db.settings.get('settings')) ?? null, [])

export async function markWelcomeDone() {
  const current = await db.settings.get('settings')
  await libraryRepository.saveSettings({ ...DEFAULTS, ...current, welcomeDone: true })
}
