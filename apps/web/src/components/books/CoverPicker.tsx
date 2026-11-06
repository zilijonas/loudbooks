import { useRef } from 'react'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { BookCover, useBlobUrl } from './BookCover'

export interface CoverPickerProps {
  title: string
  image?: Blob | null
  onChange: (img: Blob | null) => void
}

/** Cover preview (generated from the title until an image is chosen) with Choose image / Remove. */
export function CoverPicker({ title, image, onChange }: CoverPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const url = useBlobUrl(image)
  return (
    <div className="lb-coverpicker">
      <span role="img" aria-label={t('form.cover')} style={{ borderRadius: 14, boxShadow: 'var(--lb-shadow-card)' }}>
        <BookCover book={{ id: 'preview', title, cover: url ? { kind: 'image', url } : undefined }} size="lg" />
      </span>
      <div className="lb-coverpicker-text">
        <strong>{t('form.cover')}</strong>
        <p>{t(image ? 'form.coverImage' : 'form.coverGenerated')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon="image" style={{ height: 44 }} onClick={() => input.current?.click()}>{t('form.chooseImage')}</Button>
          {image && <Button variant="ghost" size="sm" style={{ height: 44, padding: '0 14px' }} onClick={() => onChange(null)}>{t('form.remove')}</Button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = '' }} />
    </div>
  )
}
