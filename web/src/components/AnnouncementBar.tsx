import type { SiteEvent } from '../content/events'
import { daysUntil } from '../lib/events'
import { timeAgo } from '../lib/format'

type Props = {
  event: SiteEvent | null
  /** ISO date of the newest published deal, or null when unknown. */
  latestPublishedAt: string | null
  now: Date
}

/** Thin dark bar above the header: the next shopping event and how fresh the listing is. */
export function AnnouncementBar({ event, latestPublishedAt, now }: Props) {
  if (!event) return null
  const days = daysUntil(event, now)
  const when = days === 0 ? 'es hoy' : days === 1 ? 'es mañana' : `en ${days} días`
  const latest = latestPublishedAt ? ` · Última oferta publicada ${timeAgo(latestPublishedAt, now)}` : ''
  return (
    <div className="bg-ink px-4 py-2 text-center text-[13px] font-medium text-white">
      {`${event.name} ${when}${latest}`}
    </div>
  )
}
