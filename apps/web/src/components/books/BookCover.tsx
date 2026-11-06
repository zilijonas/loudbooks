import { motion } from 'motion/react'
import { useEffect, useState, type CSSProperties } from 'react'
import { usePreset } from '../../motion/presets'
import { artOf, type Art } from './cover'

/** Props shape from design/components/api.d.ts (presentational; screens map their models onto it). */
export interface BookSummary {
  id: string
  title: string
  durationSec: number
  positionSec: number
  status: 'ready' | 'completed' | 'missing'
  cover?: { kind: 'image'; url: string } | { kind: 'generated' }
  chapterCount: number
  singleFile: boolean
}

const SIZE = { xs: [38, 7], sm: [44, 8], md: [76, 12], lg: [96, 14], fluid: ['100%', 16] } as const

export interface BookCoverProps {
  book: Pick<BookSummary, 'id' | 'title' | 'cover'>
  size?: keyof typeof SIZE
  /** Shared-element transition between card, mini-player and player: pass `cover-{id}`. */
  layoutId?: string
  /** Fixed art instead of the title hash (design fixtures in the dev gallery). */
  art?: Partial<Art>
  className?: string
  style?: CSSProperties
}

export function BookCover({ book, size = 'fluid', layoutId, art: override, className, style }: BookCoverProps) {
  const p = usePreset()
  const [w, r] = SIZE[size]
  const art = { ...artOf(book.title), ...override }
  const image = book.cover?.kind === 'image' ? book.cover.url : null
  return (
    <motion.div
      layoutId={layoutId}
      transition={p.sharedCover.transition}
      className={className ? `lb-cover ${className}` : 'lb-cover'}
      data-size={size}
      style={{ '--w': typeof w === 'number' ? `${w}px` : w, '--cover-r': `${r}px`, background: art.bg, color: art.fg, border: art.border, ...style } as CSSProperties}
    >
      {image ? (
        <img src={image} alt="" />
      ) : (
        <div className="lb-cover-art" style={{ justifyContent: art.justify }}>
          <div className="lb-cover-bar" style={{ background: art.accent }} />
          <div className="lb-cover-title" style={{ '--fs': art.fs } as CSSProperties}>{art.display}</div>
          {size === 'fluid' && <div className="lb-cover-author">{art.author}</div>}
        </div>
      )}
    </motion.div>
  )
}

/** Cover from a Blob (picked image) or the generated art; revokes its object URL. */
export function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  // Object URLs are an external resource: create and revoke in the same effect so StrictMode re-runs stay valid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
