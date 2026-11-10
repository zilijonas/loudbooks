import { useState } from 'react'
import { ChapterList, ChapterRow } from '../../components/books/Chapters'
import { formatDuration, formatSpeed } from '../../components/format'
import type { TimerSetting } from '../../components/player/Playback'
import { CustomTimerForm, SpeedSelector, TimerSheet } from '../../components/player/Sheets'
import { BottomSheet, Dialog } from '../../components/ui/Overlays'
import { t } from '../../i18n'
import { jumpToChapter, setRate, setTimer } from './controller'
import type { PlayerView } from './view'

const PRESET_MINUTES = [5, 15, 30]

export type SheetName = 'speed' | 'timer' | 'chapters'

const PRESETS = [0.75, 1, 1.25, 1.5]

/** Speed, sleep timer and chapters sheets (centred dialogs at ≥ 768 px). */
export function PlayerSheets({ view, sheet, onClose }: { view: PlayerView; sheet: SheetName | null; onClose: () => void }) {
  const { s, chapters, chapterIndex: ci, position } = view
  const rate = s.rate
  const timer = s.timer
  const onOpenChange = (open: boolean) => { if (!open) onClose() }
  const generated = view.chapter.kind === 'generated'
  // The wheel dialog lives beside the sheet so its exit animation is not cut short when both close together.
  const [customOpen, setCustomOpen] = useState(false)
  const [lastCustom, setLastCustom] = useState(30)
  const customNow = timer.mode === 'minutes' && !PRESET_MINUTES.includes(timer.minutes) ? timer.minutes : lastCustom
  // Same chapter count or "No timer" again changes nothing: close without rebuilding the session.
  const applyTimer = (next: TimerSetting) => { onClose(); if (next.mode === 'minutes' || JSON.stringify(next) !== JSON.stringify(timer)) setTimer(next) }
  return (
    <>
      <BottomSheet open={sheet === 'speed'} onOpenChange={onOpenChange} title={t('speed.title')}>
        <SpeedSelector
          value={rate}
          presets={PRESETS}
          onChange={setRate}
          rebuildNotice={timer.mode === 'minutes' && !!s.file}
          summary={timer.mode === 'minutes'
            ? t('speed.summarySession', { speed: formatSpeed(rate), minutes: timer.minutes, duration: formatDuration(timer.minutes * 60 * rate) })
            : t('speed.summaryHour', { speed: formatSpeed(rate), duration: formatDuration(3600 * rate) })}
        />
      </BottomSheet>
      <BottomSheet open={sheet === 'timer'} onOpenChange={onOpenChange} title={t('timer.title')}>
        <TimerSheet
          value={timer}
          chaptersRemaining={chapters.length - 1 - ci}
          singleFile={chapters.length <= 1}
          speed={rate}
          chapterLeftSec={[0, 1, 2].map((k) => (chapters[Math.min(chapters.length - 1, ci + k)]?.globalEnd ?? view.chapter.globalEnd) - position)}
          onApply={applyTimer}
          onCustom={() => setCustomOpen(true)}
        />
      </BottomSheet>
      <Dialog open={customOpen} onOpenChange={setCustomOpen} title={t('timer.custom')}>
        <CustomTimerForm
          initialMinutes={customNow}
          onCancel={() => setCustomOpen(false)}
          onSave={(minutes) => { setCustomOpen(false); setLastCustom(minutes); applyTimer({ mode: 'minutes', minutes }) }}
        />
      </Dialog>
      <BottomSheet open={sheet === 'chapters'} onOpenChange={onOpenChange} title={t(generated ? 'details.parts' : 'details.chapters')}>
        <ChapterList variant="sheet" label={t(generated ? 'details.parts' : 'details.chapters')}>
          {chapters.map((c, i) => (
            <ChapterRow
              key={c.id}
              index={i}
              title={c.title || t('player.partOf', { n: i + 1, total: chapters.length })}
              durationSec={c.globalEnd - c.globalStart}
              status={i < ci ? 'done' : i === ci ? 'current' : 'upcoming'}
              playing={view.status === 'playing'}
              onPlay={() => { onClose(); jumpToChapter(c.id) }}
            />
          ))}
        </ChapterList>
      </BottomSheet>
    </>
  )
}
