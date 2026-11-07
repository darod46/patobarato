import type { EventPhase, SiteEvent } from './types'

const TIME_ZONE = 'Europe/Madrid'
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** The calendar date (YYYY-MM-DD) of `now` in Europe/Madrid. */
function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
const parts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number]

/** Whole calendar days from today (Europe/Madrid) to the event's first day; 0 = today, negative = started. */
export function daysUntil(event: SiteEvent, now: Date): number {
  return dayNumber(event.startsOn) - dayNumber(localDate(now))
}

/** Whether today (Europe/Madrid) is before, within or after the event's inclusive dates. */
export function eventPhase(event: SiteEvent, now: Date): EventPhase {
  const today = localDate(now)
  if (today < event.startsOn) return 'before'
  if (today > event.endsOn) return 'after'
  return 'during'
}

/** Events that have not ended yet (an event in progress included), by first day, at most `n`. */
export function upcomingEvents(now: Date, n: number, events: SiteEvent[]): SiteEvent[] {
  const today = localDate(now)
  return events
    .filter((e) => e.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .slice(0, n)
}

/** Default window for announcing the next event (spec §5.1). */
export const ANNOUNCE_WINDOW_DAYS = 45

/** The next event, or null when none starts within `withinDays` (unbounded when omitted). */
export function nextEvent(now: Date, events: SiteEvent[], withinDays?: number): SiteEvent | null {
  const next = upcomingEvents(now, 1, events)[0] ?? null
  if (!next) return null
  return withinDays !== undefined && daysUntil(next, now) > withinDays ? null : next
}

/** The event in progress today; when several overlap, the one that started last. */
export function activeEvent(now: Date, events: SiteEvent[]): SiteEvent | null {
  let best: SiteEvent | null = null
  for (const e of events) {
    if (eventPhase(e, now) === 'during' && (!best || e.startsOn > best.startsOn)) best = e
  }
  return best
}

export const eventPath = (slug: string) => `/eventos/${slug}`

export const eventYear = (event: SiteEvent) => parts(event.startsOn)[0]

/**
 * "en 5 días" / "es hoy" / "es mañana", "está en marcha" while a multi-day event runs, or "en julio" for an
 * approximate date — never a count to a guessed date, never a negative count.
 */
export function whenLabel(event: SiteEvent, now: Date): string {
  if (event.approximate) return `en ${eventDateLabel(event)}`
  if (eventPhase(event, now) === 'during') return event.startsOn === event.endsOn ? 'es hoy' : 'está en marcha'
  const days = daysUntil(event, now)
  if (days === 0) return 'es hoy'
  if (days === 1) return 'es mañana'
  return `en ${days} días`
}

/** "27 de noviembre" (first or last day); the month alone when the date is approximate. */
export function eventLongDateLabel(event: SiteEvent, which: 'start' | 'end' = 'start'): string {
  const [, month, day] = parts(which === 'start' ? event.startsOn : event.endsOn)
  return event.approximate ? MONTH_NAMES[month - 1] : `${day} de ${MONTH_NAMES[month - 1]}`
}

/** "11 nov", or the month name alone ("julio") when the date is approximate. */
export function eventDateLabel(event: SiteEvent): string {
  const [, month, day] = parts(event.startsOn)
  return event.approximate ? MONTH_NAMES[month - 1] : `${day} ${MONTHS[month - 1]}`
}

/** "27 – 29 de noviembre", "11 de noviembre", "7 de enero – 28 de febrero", or the month alone when approximate. */
export function eventRangeLabel(event: SiteEvent): string {
  if (event.approximate || event.startsOn === event.endsOn) return eventLongDateLabel(event)
  if (event.startsOn.slice(0, 7) === event.endsOn.slice(0, 7)) {
    const [, month, d1] = parts(event.startsOn)
    return `${d1} – ${parts(event.endsOn)[2]} de ${MONTH_NAMES[month - 1]}`
  }
  return `${eventLongDateLabel(event)} – ${eventLongDateLabel(event, 'end')}`
}
