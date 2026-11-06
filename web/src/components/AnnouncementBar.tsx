import type { SiteEvent } from '../content/events'
import { eventLongDateLabel, whenLabel } from '../lib/events'
import { timeAgo } from '../lib/format'

type Props = {
  event: SiteEvent | null
  /** The event after `event`, shown with its full date; approximate dates are left out. */
  second?: SiteEvent | null
  /** ISO date of the newest published deal, or null when unknown. */
  latestPublishedAt: string | null
  now: Date
}

/** Thin dark bar above the header: the next shopping event and how fresh the listing is. */
export function AnnouncementBar({ event, second = null, latestPublishedAt, now }: Props) {
  if (!event) return null
  const when = whenLabel(event, now)
  const next = second && !second.approximate ? ` · ${second.name} el ${eventLongDateLabel(second)}` : ''
  const latest = latestPublishedAt ? ` · Última oferta publicada ${timeAgo(latestPublishedAt, now)}` : ''
  return (
    <div className="bg-ink px-4 py-2 text-center text-[13px] font-medium text-white">
      {`${event.name} ${when}${next}${latest}`}
    </div>
  )
}
