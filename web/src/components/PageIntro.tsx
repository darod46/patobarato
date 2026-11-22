import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { eventPath, eventRangeLabel, eventYear } from '../lib/events'
import { renderCopy, type CopyValues } from '../lib/page-copy'
import { faqJsonLd, jsonLdScript } from '../lib/seo'
import type { PageCopy, SiteEvent } from '../lib/types'
import { GuideFaq } from './guides/GuideFaq'
import { Markdown } from './Markdown'

type IntroProps = {
  h1: string
  copy: PageCopy | null
  values: CopyValues
  nextEvent?: SiteEvent | null
  className?: string
}

/**
 * Listing heading, next-event line and editorial intro. Rendered on the server and handed to client
 * listings as a ready `ReactNode` slot, so neither the Markdown renderer nor the raw copy reaches the browser.
 */
export function PageIntro({ h1, copy, values, nextEvent, className }: IntroProps) {
  return (
    <header className={className}>
      <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">{h1}</h1>
      {nextEvent && (
        <div data-testid="next-event" className="mt-2 flex items-start gap-2 text-sm text-muted">
          <CalendarDays size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="min-w-0">
            Próximo evento:{' '}
            {/* 12 px padding on the 20 px line gives a 44 px tap target; the negative margin keeps the line height. */}
            <Link
              href={eventPath(nextEvent.slug)}
              className="-my-3 inline-block py-3 font-semibold text-primary hover:underline"
            >
              {nextEvent.name} {eventYear(nextEvent)}
            </Link>{' '}
            ({eventRangeLabel(nextEvent)})
          </p>
        </div>
      )}
      {copy && copy.introMd.trim() !== '' && <Markdown source={renderCopy(copy.introMd, values)} className="mt-3" />}
    </header>
  )
}

type FaqProps = {
  faq: PageCopy['faq'] | null | undefined
  className?: string
}

/** The editorial FAQ and its FAQPage JSON-LD, placed below the listing. Nothing without questions. */
export function PageFaq({ faq, className = 'mt-12' }: FaqProps) {
  if (!faq || faq.length === 0) return null
  return (
    <div className={className}>
      <GuideFaq faq={faq} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd(faq))} />
    </div>
  )
}
