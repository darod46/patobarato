import Link from 'next/link'
import { eventLongDateLabel, eventPath, eventYear, whenLabel } from '../../lib/events'
import type { EventPhase, SiteEvent } from '../../lib/types'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Props = {
  event: SiteEvent
  /** Computed once by the page from the same `now`. */
  phase: EventPhase
  /** The following event, only used once this one is over. */
  next: SiteEvent | null
  now: Date
}

/** One line under the event title saying when it starts, until when it runs, or that it ended and what comes next. */
export function EventStatusLine({ event, phase, next, now }: Props) {
  const start = eventLongDateLabel(event, 'start')
  const end = eventLongDateLabel(event, 'end')
  let content: React.ReactNode
  if (event.approximate) {
    // Unannounced dates: only the month is known, so never claim a day or a countdown.
    content = phase === 'after' ? `Fue en ${start}. Volverá en ${eventYear(event) + 1}.` : `Previsto para ${start}`
  } else if (phase === 'before') {
    content = `Empieza el ${start} (${whenLabel(event, now)})`
  } else if (phase === 'during') {
    content = event.startsOn === event.endsOn ? 'Es hoy' : `En marcha hasta el ${end}`
  } else if (next) {
    content = (
      <>
        {`Terminó el ${end}. El próximo evento es `}
        <Link href={eventPath(next.slug)} className={`inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline ${FOCUS}`}>
          {next.name}
        </Link>
        .
      </>
    )
  } else {
    content = `Terminó el ${end}. Volverá en ${eventYear(event) + 1}.`
  }
  return <p className="mt-3 text-lg text-muted">{content}</p>
}
