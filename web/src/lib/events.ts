import { EVENTS, type SiteEvent } from '../content/events'

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

/** Whole calendar days from today (Europe/Madrid) to the event; 0 = today, negative = past. */
export function daysUntil(event: SiteEvent, now: Date): number {
  return dayNumber(event.date) - dayNumber(localDate(now))
}

export function upcomingEvents(now: Date, n: number, events: SiteEvent[] = EVENTS): SiteEvent[] {
  return events
    .filter((e) => daysUntil(e, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n)
}

export function nextEvent(now: Date, events: SiteEvent[] = EVENTS): SiteEvent | null {
  return upcomingEvents(now, 1, events)[0] ?? null
}

/** "11 nov", or the month name alone ("julio") when the date is approximate. */
export function eventDateLabel(event: SiteEvent): string {
  const [, month, day] = event.date.split('-').map(Number)
  return event.approximate ? MONTH_NAMES[month - 1] : `${day} ${MONTHS[month - 1]}`
}
