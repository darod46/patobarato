import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { eventPath, eventRangeLabel, eventYear } from '../lib/events'
import { renderCopy, type CopyValues } from '../lib/page-copy'
import { faqJsonLd, jsonLdScript } from '../lib/seo'
import type { PageCopy, SiteEvent } from '../lib/types'
import { GuideFaq } from './guides/GuideFaq'
import { Markdown } from './Markdown'

type Props = {
  h1: string
  copy: PageCopy | null
  values: CopyValues
  nextEvent?: SiteEvent | null
  className?: string
}

/** Listing heading plus the editorial intro, FAQ and next-event link. Plain component: safe in client parents. */
export function PageIntro({ h1, copy, values, nextEvent, className }: Props) {
  return (
    <header className={className}>
      <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">{h1}</h1>
      {nextEvent && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <CalendarDays size={16} aria-hidden="true" className="shrink-0" />
          <span>
            Próximo evento:{' '}
            <Link href={eventPath(nextEvent.slug)} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
              {nextEvent.name} {eventYear(nextEvent)}
            </Link>{' '}
            ({eventRangeLabel(nextEvent)})
          </span>
        </p>
      )}
      {copy && (
        <>
          <Markdown source={renderCopy(copy.introMd, values)} className="mt-3" />
          {copy.faq.length > 0 && (
            <>
              <div className="mt-8">
                <GuideFaq faq={copy.faq} />
              </div>
              <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd(copy.faq))} />
            </>
          )}
        </>
      )}
    </header>
  )
}
