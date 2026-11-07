'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Props = {
  /** The search field (a `HeaderSearch`); rendered inside the strip that drops below the header. */
  children: ReactNode
  /** Start open, e.g. on a listing page that already has a query in the URL. */
  initiallyOpen?: boolean
}

/** A round magnifier button in the header; it toggles a full-width search strip under the header row. */
export function HeaderSearchToggle({ children, initiallyOpen = false }: Props) {
  const [open, setOpen] = useState(initiallyOpen)
  const strip = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  // Focus the field when the strip opens by a click (not on the initial render, which would steal focus).
  const opened = useRef(false)
  useEffect(() => {
    if (open && opened.current) strip.current?.querySelector('input')?.focus()
    opened.current = true
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Cerrar búsqueda' : 'Buscar'}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface ${open ? 'bg-surface' : ''} ${FOCUS}`}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Search size={22} aria-hidden="true" />}
      </button>
      <div
        id={id}
        ref={strip}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
        className="absolute inset-x-0 top-full border-b border-line bg-white shadow-[0_8px_24px_rgba(20,22,26,.08)]"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-3 md:px-8">{children}</div>
      </div>
    </>
  )
}
