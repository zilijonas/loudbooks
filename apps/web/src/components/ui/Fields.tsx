import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, useState, type ComponentPropsWithoutRef, type DragEvent, type KeyboardEvent } from 'react'
import { usePreset } from '../../motion/presets'
import { t } from '../../i18n'
import { Ic } from '../icons'
import { Button } from './Button'
import { Reveal } from './Reveal'

interface FieldBase {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string
  /** Shows "Required" / "Optional" beside the label. Omit for neither. */
  required?: boolean
  placeholder?: string
  disabled?: boolean
}

function Frame({ id, label, hint, error, required, disabled, children }: Omit<FieldBase, 'value' | 'onChange' | 'placeholder'> & { id: string; children: React.ReactNode }) {
  return (
    <div className="lb-field" data-disabled={disabled || undefined}>
      <label htmlFor={id} className="lb-field-label">
        {label}
        {required !== undefined && <span>{t(required ? 'form.required' : 'form.optional')}</span>}
      </label>
      {children}
      {hint && <span id={`${id}-hint`} className="lb-hint">{hint}</span>}
      <Reveal show={!!error} as="span" className="lb-error" id={`${id}-err`} role="alert">
        <Ic name="alert" size={16} />
        {error}
      </Reveal>
    </div>
  )
}

const describedBy = (id: string, hint?: string, error?: string) => [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined

export interface TextFieldProps extends FieldBase {
  inputMode?: 'text' | 'decimal' | 'numeric' | 'url'
  autoComplete?: string
}

export function TextField({ label, value, onChange, hint, error, required, inputMode, placeholder, disabled, autoComplete = 'off' }: TextFieldProps) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required} disabled={disabled}>
      <input
        id={id}
        className="lb-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        aria-required={required || undefined}
      />
    </Frame>
  )
}

export function TextArea({ label, value, onChange, hint, error, required, placeholder, disabled, rows = 3 }: FieldBase & { rows?: number }) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required} disabled={disabled}>
      <textarea
        id={id}
        className="lb-input"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Frame>
  )
}

export interface SearchOption { id: string; content: React.ReactNode }

/**
 * Search input. With `options` it is a WAI-ARIA combobox (list autocomplete): the popup is open while the input has focus,
 * has text and there is at least one option. Arrows move the active option (no animation), Enter picks it, Escape closes
 * the popup and then clears the text.
 */
export function SearchField({ value, onChange, label = t('library.search'), options, onPick, listLabel = t('library.matching'), ...rest }: {
  value: string
  onChange: (v: string) => void
  label?: string
  options?: SearchOption[]
  onPick?: (id: string) => void
  listLabel?: string
} & Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'>) {
  const listId = useId()
  const p = usePreset()
  const [focused, setFocused] = useState(false)
  const [closed, setClosed] = useState(false)
  const [active, setActive] = useState(-1)
  const n = options?.length ?? 0
  const open = focused && !closed && value.trim() !== '' && n > 0
  const pick = (id: string) => { setClosed(true); onPick?.(id) }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n || !value.trim()) return
      e.preventDefault()
      setClosed(false)
      setActive(e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1)
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault()
      pick(options![active]!.id)
    } else if (e.key === 'Escape' && (open || value)) {
      e.preventDefault()
      if (open) { setClosed(true); setActive(-1) } else onChange('')
    }
  }
  return (
    <div className="lb-search">
      <Ic name="search" size={20} />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => { onChange(e.target.value); setClosed(false); setActive(-1) }}
        placeholder={label}
        aria-label={label}
        {...(options && {
          role: 'combobox',
          'aria-autocomplete': 'list',
          'aria-expanded': open,
          'aria-controls': listId,
          'aria-activedescendant': open && active >= 0 ? `${listId}-${active}` : undefined,
          onKeyDown,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
        })}
        {...rest}
      />
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul key="list" id={listId} role="listbox" aria-label={listLabel} className="lb-suggest" {...p.menu}>
            {options!.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                data-active={i === active || undefined}
                // mousedown would blur the input (closing the list) before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(o.id)}
              >
                {o.content}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export interface FileDropzoneProps {
  accept: string[]
  multiple?: boolean
  onFiles: (files: File[]) => void
  /** Button label, e.g. "Choose audio files" or "Add more files". */
  label: string
  note?: string
}

/** File picker (`<input type=file>`, works everywhere incl. iOS) plus desktop drag-and-drop. */
export function FileDropzone({ accept, multiple = true, onFiles, label, note = t('form.drop') }: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => list && list.length > 0 && onFiles([...list])
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files)
  }
  return (
    <div
      className="lb-dropzone"
      data-over={over || undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={onDrop}
    >
      <Ic name="music" size={28} />
      <Button onClick={() => input.current?.click()}>{label}</Button>
      <span className="lb-dropzone-note">{note}</span>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={accept.join(',')}
        onChange={(e) => { take(e.target.files); e.target.value = '' }}
      />
    </div>
  )
}
