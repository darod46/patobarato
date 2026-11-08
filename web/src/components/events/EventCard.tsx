import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { eventPath, eventPhase, eventRangeLabel } from '../../lib/events'
import { storeNames } from '../../lib/stores'
import { stripMarkdown } from '../../lib/text'
import type { EventPhase, SiteEvent } from '../../lib/types'

const PHASE_LABEL: Record<EventPhase, string> = { during: 'En marcha', before: 'Próximo', after: 'Pasado' }

export function EventCard({ event, now }: { event: SiteEvent; now: Date }) {
  const phase = eventPhase(event, now)
  const range = eventRangeLabel(event)
  const stores = storeNames(event.stores)
  const intro = stripMarkdown(event.introMd.split('\n')[0])
  return (
    <li className="relative flex h-full flex-col gap-2 rounded-2xl border border-line bg-white p-5 focus-within:border-primary hover:border-primary">
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
        <CalendarDays size={14} aria-hidden="true" />
        {PHASE_LABEL[phase]}
      </p>
      <h3 className="font-display text-xl leading-snug font-bold tracking-[-0.02em]">
        <Link
          href={eventPath(event.slug)}
          className="inline-flex min-h-11 items-center after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {event.name}
        </Link>
      </h3>
      <p className="text-sm font-semibold">{event.approximate ? `Previsto para ${range}` : range}</p>
      {intro && <p className="text-muted">{intro}</p>}
      {stores.length > 0 && <p className="mt-auto pt-2 text-sm text-muted">{stores.join(' · ')}</p>}
    </li>
  )
}
