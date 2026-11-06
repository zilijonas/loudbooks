import { ChapterList, ChapterRow } from '../../components/books/Chapters'
import { formatDuration, formatSpeed } from '../../components/format'
import { SpeedSelector, TimerSheet } from '../../components/player/Sheets'
import { BottomSheet } from '../../components/ui/Overlays'
import { t } from '../../i18n'
import { jumpToChapter, setRate, setTimer } from './controller'
import type { PlayerView } from './view'

export type SheetName = 'speed' | 'timer' | 'chapters'

const PRESETS = [0.75, 1, 1.25, 1.5]

/** Speed, sleep timer and chapters sheets (centred dialogs at ≥ 768 px). */
export function PlayerSheets({ view, sheet, onClose }: { view: PlayerView; sheet: SheetName | null; onClose: () => void }) {
  const { s, chapters, chapterIndex: ci, position } = view
  const rate = s.rate
  const timer = s.timer
  const onOpenChange = (open: boolean) => { if (!open) onClose() }
  const generated = view.chapter.kind === 'generated'
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
          chapterIndex={ci}
          chaptersRemaining={chapters.length - 1 - ci}
          singleFile={chapters.length <= 1}
          speed={rate}
          currentChapterLeftSec={view.chapter.globalEnd - position}
          onApply={(next) => { onClose(); setTimer(next) }}
        />
      </BottomSheet>
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
