'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import type { Deal } from '../lib/types'
import { DealCard } from './DealCard'

type Props = { deals: Deal[]; now: Date }

const MAX_DEALS = 5
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const ARROW = `hidden size-11 items-center disabled:cursor-default disabled:opacity-40 justify-center rounded-full border border-line bg-white text-ink shadow-sm enabled:hover:bg-surface md:inline-flex ${FOCUS}`

/** Home carousel: the newest deals in a snap-scrolling row, with a link to the full listing at `/chollos`. */
export function DealCarousel({ deals, now }: Props) {
  const row = useRef<HTMLDivElement>(null)
  const shown = deals.slice(0, MAX_DEALS)

  // Hydration-safe: the server and first client render start at the left edge.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const onScroll = () => {
    const el = row.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  // One card plus the gap between cards, measured from the first card.
  const scrollByCard = (direction: 1 | -1) => {
    const el = row.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const step = (first?.offsetWidth || 280) + gap
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * step, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <div className="flex flex-col gap-6">
      {shown.length > 0 ? (
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Anterior" onClick={() => scrollByCard(-1)} disabled={atStart} className={ARROW}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <div
            ref={row}
            role="region"
            aria-label="Últimos chollos"
            tabIndex={0}
            onScroll={onScroll}
            className={`-mx-4 flex min-w-0 flex-1 scroll-pl-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden ${FOCUS}`}
          >
            {shown.map((deal) => (
              <div key={deal.publicationId} className="w-[280px] shrink-0 snap-start">
                <DealCard deal={deal} now={now} />
              </div>
            ))}
          </div>
          <button type="button" aria-label="Siguiente" onClick={() => scrollByCard(1)} disabled={atEnd} className={ARROW}>
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : (
        <p className="text-muted">Ahora mismo no podemos cargar los chollos</p>
      )}
      <Link
        href="/chollos"
        className={`mx-auto inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-8 text-[15px] font-semibold text-white hover:bg-primary-hover ${FOCUS}`}
      >
        Ver todos los chollos
      </Link>
    </div>
  )
}
