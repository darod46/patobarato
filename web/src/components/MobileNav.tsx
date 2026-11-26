'use client'

import { ChevronRight, Menu, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ChannelButton } from './ChannelButton'

type Props = {
  links: { label: string; href: string }[]
  /** Show the search field at the top of the panel (below `md`, where the header has no field). The search page hides it. */
  search?: boolean
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Hamburger menu below the `lg` breakpoint: search (below `md`), the main navigation and the labelled channel button. */
export function MobileNav({ links, search = true }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={root} className="lg:hidden">
      <button
        type="button"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-surface aria-expanded:border-ink aria-expanded:bg-ink aria-expanded:text-white ${FOCUS}`}
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-white shadow-[0_16px_32px_rgba(20,22,26,.12)]"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 pt-4 pb-5">
            {search && (
              <form action="/buscar" method="get" role="search" aria-label="Buscar chollos" className="md:hidden">
                <label className="group relative flex items-center">
                  <span className="sr-only">Buscar chollos</span>
                  <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 text-muted transition-colors group-focus-within:text-primary"
                  />
                  {/* 16 px text: iOS zooms into smaller fields on focus. */}
                  <input
                    type="search"
                    name="q"
                    placeholder="Buscar chollos…"
                    autoComplete="off"
                    enterKeyHint="search"
                    className="h-12 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-base text-ink placeholder:text-muted focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
                  />
                </label>
              </form>
            )}
            <nav aria-label="Principal">
              <ul className="flex flex-col">
                {links.map((link) => (
                  <li key={link.href} className="border-b border-line last:border-b-0">
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between rounded-lg px-2 py-3.5 text-base font-semibold text-ink hover:text-primary ${FOCUS}`}
                    >
                      {link.label}
                      <ChevronRight size={18} aria-hidden="true" className="text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {/* The bar only fits the plane icon on phones; here it gets its label. Counted as a header click. */}
            <ChannelButton placement="header" size="lg" className="w-full justify-center sm:hidden">
              Unirme al canal
            </ChannelButton>
          </div>
        </div>
      )}
    </div>
  )
}
