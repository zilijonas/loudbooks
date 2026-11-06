import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatBytes, formatClock, formatDuration } from '../format'
import { Ic } from '../icons'
import { Reveal } from '../ui/Reveal'

export interface ChapterRowProps {
  index: number
  title: string
  durationSec: number
  status: 'upcoming' | 'current' | 'done'
  playing?: boolean
  positionInChapterSec?: number
  /** The chapter Play would start (nothing heard yet): its number is accented like the current row's glyph. */
  next?: boolean
  onPlay: () => void
}

/** One chapter in a ChapterList: check when done, play/pause glyph when current, otherwise its number. */
export function ChapterRow({ index, title, durationSec, status, playing, positionInChapterSec, next, onPlay }: ChapterRowProps) {
  const current = status === 'current'
  return (
    <li>
      <button type="button" className="lb-chapter" aria-current={current || undefined} onClick={onPlay}>
        <span className="lb-chapter-lead" data-tone={status === 'done' ? 'done' : current || next ? 'current' : undefined}>
          {status === 'done' ? <Ic name="check" size={22} /> : current ? <Ic name={playing ? 'pause' : 'play'} size={22} /> : index + 1}
        </span>
        <span className="lb-chapter-text">
          <span className="lb-chapter-title">{title}</span>
          <Reveal show={current && positionInChapterSec !== undefined} as="span" className="lb-chapter-now">
            {playing ? t('details.playing') : t('details.here', { time: formatClock(positionInChapterSec ?? 0) })}
          </Reveal>
        </span>
        <span className="lb-chapter-dur">{formatDuration(durationSec)}</span>
      </button>
    </li>
  )
}

/** `card`: bordered list on Book details. `sheet`: borderless rows inside the Chapters sheet. */
export function ChapterList({ label, variant = 'card', children }: { label?: string; variant?: 'card' | 'sheet'; children: ReactNode }) {
  return <ol className="lb-chapters" data-variant={variant} aria-label={label}>{children}</ol>
}

export interface EditableChapter {
  id: string
  title: string
  filename: string
  durationSec?: number
  bytes?: number
  status: 'checking' | 'ok' | 'error'
  error?: string
}

interface RowProps extends EditableChapter {
  index: number
  count: number
  lifted?: boolean
  onRename: (title: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove?: () => void
  handle?: ReactNode
}

function RowBody({ index, count, title, filename, durationSec, bytes, status, error, lifted, onRename, onMoveUp, onMoveDown, onRemove, handle }: RowProps) {
  const sub = status === 'checking' ? t('form.checking') : status === 'error' ? error : [filename, durationSec !== undefined && formatClock(durationSec), bytes !== undefined && formatBytes(bytes)].filter(Boolean).join(' · ')
  return (
    <div className="lb-edit-row" data-error={status === 'error' || undefined} data-lifted={lifted || undefined}>
      {handle ?? <span />}
      <span className="lb-edit-n">{index + 1}</span>
      <span className="lb-edit-text">
        <input className="lb-edit-title" value={title} onChange={(e) => onRename(e.target.value)} aria-label={t('form.chapterTitle', { n: index + 1 })} />
        <span className="lb-edit-sub">
          {status === 'checking' && <Ic name="spin" size={13} />}
          {status === 'error' && <Ic name="alert" size={13} />}
          <span>{sub}</span>
        </span>
      </span>
      <span className="lb-edit-actions">
        <button type="button" disabled={index === 0 || !onMoveUp} onClick={onMoveUp} aria-label={t('form.moveUp', { title })}><Ic name="up" size={18} /></button>
        <button type="button" disabled={index === count - 1 || !onMoveDown} onClick={onMoveDown} aria-label={t('form.moveDown', { title })}><Ic name="dn" size={18} /></button>
        {onRemove && <button type="button" data-remove="" onClick={onRemove} aria-label={t('form.removeFile', { title })}><Ic name="x" size={18} /></button>}
      </span>
    </div>
  )
}

/** Static row (no drag context), e.g. a single file or the gallery. */
export function EditableChapterRow(props: RowProps) {
  return <RowBody {...props} handle={props.handle ?? <ReorderHandle />} />
}

/** Grip for pointer/touch drag. Keyboard and screen-reader users reorder with the labelled Up/Down buttons. */
export function ReorderHandle(props: Record<string, unknown>) {
  return (
    <span className="lb-grip" aria-hidden="true" {...props}>
      <Ic name="grip" size={20} />
    </span>
  )
}

function SortableRow(props: RowProps & { id: string; keyboard: boolean }) {
  const reduce = useReducedMotion()
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: props.id,
    transition: { duration: 300, easing: 'cubic-bezier(.34,1.45,.5,1)' }, // neighbours spring aside (prototype curve)
  })
  const { role: _r, tabIndex: _t, ...attrs } = attributes // the grip is pointer-only; buttons cover keyboard
  void _r; void _t
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition: reduce || props.keyboard ? undefined : transition }}>
      {isDragging ? (
        <div className="lb-edit-placeholder" aria-hidden="true" />
      ) : (
        <RowBody {...props} handle={<ReorderHandle ref={setActivatorNodeRef} {...attrs} {...listeners} title={undefined} />} />
      )}
    </div>
  )
}

export interface EditableChapterListProps {
  items: EditableChapter[]
  onReorder: (from: number, to: number) => void
  onRename: (id: string, title: string) => void
  onRemove?: (id: string) => void
}

/** Reorderable chapter files (dnd-kit): lifted row scales 1.03 with the lift shadow over a dashed placeholder. */
export function EditableChapterList({ items, onReorder, onRename, onRemove }: EditableChapterListProps) {
  const p = usePreset()
  const [active, setActive] = useState<string | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  useEffect(() => {
    const key = () => setKeyboard(true)
    const pointer = () => setKeyboard(false)
    const click = (event: MouseEvent) => {
      if (event.detail === 0 && !(event.target instanceof HTMLInputElement && event.target.type === 'file')) setKeyboard(true)
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('click', click, true)
    }
  }, [])
  // Pointer only: keyboard users reorder with the labelled Up/Down buttons, which move without animation.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = items.map((i) => i.id)
  const end = (e: DragEndEvent) => {
    setActive(null)
    const from = ids.indexOf(String(e.active.id))
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1
    if (from >= 0 && to >= 0 && from !== to) onReorder(from, to)
  }
  const activeIndex = active ? ids.indexOf(active) : -1
  const activeItem = items[activeIndex]
  const rowProps = (c: EditableChapter, i: number) => ({
    ...c,
    index: i,
    count: items.length,
    onRename: (v: string) => onRename(c.id, v),
    onRemove: onRemove && (() => onRemove(c.id)),
    onMoveUp: () => onReorder(i, i - 1),
    onMoveDown: () => onReorder(i, i + 1),
  })
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={end} onDragCancel={() => setActive(null)}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="lb-edit-list" aria-label={t('details.chapters')} style={items.length ? undefined : { marginBottom: 0 }}>
          <AnimatePresence initial={false} custom={keyboard}>
            {items.map((c, i) => (
              <motion.li key={c.id} initial={keyboard ? false : p.reveal.initial} animate={p.reveal.animate}
                variants={{ exit: (viaKeyboard: boolean) => viaKeyboard ? { opacity: 0, transition: { duration: 0 } } : p.reveal.exit }}
                exit="exit" transition={p.reveal.transition}>
                <SortableRow {...rowProps(c, i)} keyboard={keyboard} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' }}>
        {activeItem && (
          <motion.div initial={{ transform: 'scale(1)' }} animate={'scale' in p.reorder.lifted ? { transform: 'scale(1.03)' } : {}} transition={p.springPlayful}>
            <RowBody {...rowProps(activeItem, activeIndex)} lifted handle={<ReorderHandle />} />
          </motion.div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

