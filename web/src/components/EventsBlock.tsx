import Link from 'next/link'
import { daysUntil, eventDateLabel, eventLongDateLabel, eventPath, eventPhase } from '../lib/events'
import { storeNames } from '../lib/stores'
import type { SiteEvent } from '../lib/types'

type Props = { next: SiteEvent | null; upcoming: SiteEvent[]; now: Date }

function countdown(event: SiteEvent, now: Date): string {
  if (event.approximate) return `En ${eventDateLabel(event)}`
  if (eventPhase(event, now) === 'during') {
    return event.startsOn === event.endsOn ? 'Es hoy' : `En marcha hasta el ${eventLongDateLabel(event, 'end')}`
  }
  const days = daysUntil(event, now)
  if (days === 0) return 'Es hoy'
  if (days === 1) return 'Es mañana'
  return `Faltan ${days} días`
}

/** Dark band: the next shopping event and the following ones. */
export function EventsBlock({ next, upcoming, now }: Props) {
  return (
    <section id="eventos" className="scroll-mt-32 bg-ink py-14 text-white md:py-16">
      <div className={`mx-auto grid max-w-[1200px] gap-10 px-4 md:px-8 ${next ? 'md:grid-cols-2' : ''}`}>
        {next && (
          <div className="flex flex-col justify-center gap-4">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-accent">
              {eventPhase(next, now) === 'during' ? 'Evento en marcha' : 'Próximo gran evento'}
            </span>
            <h2 className="font-display text-3xl font-bold tracking-[-0.02em] md:text-[40px]">
              <Link href={eventPath(next.slug)} className="inline-flex min-h-11 items-center hover:underline">
                {next.name}
              </Link>
            </h2>
            <p className="font-display text-2xl font-bold text-white/90">{countdown(next, now)}</p>
            {next.stores.length > 0 && (
              <p className="text-[#b7bcc6]">Tiendas: {storeNames(next.stores).join(', ')}.</p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <span className="mb-1 text-sm font-semibold text-[#b7bcc6]">Calendario de chollos</span>
          {upcoming.length === 0 && <p className="text-[#b7bcc6]">No hay eventos próximos en el calendario.</p>}
          {upcoming.map((event) => (
            <div key={event.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-[#23262c] px-4 py-1">
              <span className="min-w-16 font-display text-base font-bold">{eventDateLabel(event)}</span>
              <Link href={eventPath(event.slug)} className="flex min-h-11 flex-1 items-center text-[15px] hover:underline">
                {event.name}
              </Link>
              {event.stores.length > 0 && (
                <span className="text-xs text-[#b7bcc6]">{storeNames(event.stores).join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
