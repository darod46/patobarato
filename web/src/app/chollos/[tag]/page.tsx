import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { HashtagClient } from '../../../components/HashtagClient'
import { PageFaq, PageIntro } from '../../../components/PageIntro'
import { fetchDeals, fetchHashtagCount, fetchHashtags } from '../../../lib/deals'
import { fetchEvents } from '../../../lib/events-data'
import { ANNOUNCE_WINDOW_DAYS, nextEvent } from '../../../lib/events'
import { optional } from '../../../lib/optional'
import { defaultH1, fetchPageCopy } from '../../../lib/page-copy'
import { MIN_INDEXABLE_DEALS, breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../../lib/seo'
import { getSupabase } from '../../../lib/supabase'
import { parseTagParam, tagPath } from '../../../lib/urls'

// Listings are regenerated at most every 60 s.
export const revalidate = 600

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ tag: string }> }

// Shared by generateMetadata and the page within one request. Null means 404.
// The deals are the primary read: a failure throws (Next keeps the last ISR version), never 404/noindex.
const loadTag = cache(async (param: string) => {
  // Depending on the Next.js version the param arrives decoded or still percent-encoded.
  const tag = parseTagParam(param)
  if (!tag) return null
  const client = getSupabase()
  const [page, hashtagCount, copyRead] = await Promise.all([
    fetchDeals(client, { tag, page: 0 }),
    // The count only feeds the copy and indexing; on failure fall back to the deals fetched.
    fetchHashtagCount(client, tag).catch(() => null),
    optional('chollos-tag', () => fetchPageCopy(client, 'category', tag)),
  ])
  if (page.deals.length === 0) return null
  const count = hashtagCount ?? page.deals.length
  // A failed copy read (undefined) is not "no copy": the DB did not answer, so it never makes the page noindex.
  const copyFailed = copyRead === undefined
  const copy = copyRead ?? null
  return { tag, page, count, copy, copyFailed }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadTag((await params).tag)
  if (!data) notFound()
  return listingMetadata({
    kind: 'category',
    slug: data.tag,
    path: tagPath(data.tag),
    copy: data.copy,
    values: { deals: data.count },
    // Thin only when the DB answered with 1–2 deals and no editorial copy (spec §6); a failed copy read keeps it indexable.
    indexable: data.copyFailed || data.copy !== null || data.count >= MIN_INDEXABLE_DEALS,
    fallbackDescription: `Los últimos chollos de #${data.tag} en Amazon, cazados por PatoBarato con su precio, el precio anterior y el cupón si lo hay.`,
  })
}

export default async function HashtagPage({ params }: Props) {
  const data = await loadTag((await params).tag)
  if (!data) notFound()
  // Chips and the next event are optional: the listing still renders if they fail.
  const [tags, events] = await Promise.all([
    fetchHashtags(getSupabase(), 12).catch(() => []),
    optional('chollos-tag', () => fetchEvents(getSupabase())),
  ])
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: `#${data.tag}`, path: tagPath(data.tag) },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <HashtagClient
        tag={data.tag}
        now={new Date().toISOString()}
        initialDeals={{ q: '', tag: data.tag, ...data.page }}
        initialTags={tags.map((h) => h.tag)}
        intro={
          <PageIntro
            h1={data.copy?.h1 ?? defaultH1('category', data.tag)}
            copy={data.copy}
            values={{ deals: data.count }}
            nextEvent={events ? nextEvent(new Date(), events, ANNOUNCE_WINDOW_DAYS) : null}
          />
        }
        faq={<PageFaq faq={data.copy?.faq} />}
      />
    </>
  )
}
