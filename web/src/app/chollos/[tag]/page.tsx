import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { HashtagClient } from '../../../components/HashtagClient'
import { fetchDeals, fetchHashtagCount, fetchHashtags } from '../../../lib/deals'
import { breadcrumbJsonLd, hashtagMetadata, jsonLdScript } from '../../../lib/seo'
import { getSupabase } from '../../../lib/supabase'
import { parseTagParam, tagPath } from '../../../lib/urls'

// Listings are regenerated at most every 60 s.
export const revalidate = 60

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ tag: string }> }

// Shared by generateMetadata and the page within one request. Null means 404.
const loadTag = cache(async (param: string) => {
  // Depending on the Next.js version the param arrives decoded or still percent-encoded.
  const tag = parseTagParam(param)
  if (!tag) return null
  const client = getSupabase()
  const [page, count] = await Promise.all([
    fetchDeals(client, { tag, page: 0 }),
    // The count only decides indexing; on failure fall back to the deals fetched.
    fetchHashtagCount(client, tag).catch(() => null),
  ])
  if (page.deals.length === 0) return null
  return { tag, page, count: count ?? page.deals.length }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadTag((await params).tag)
  if (!data) notFound()
  return hashtagMetadata(data.tag, data.count)
}

export default async function HashtagPage({ params }: Props) {
  const data = await loadTag((await params).tag)
  if (!data) notFound()
  // Chips are optional: the listing still renders if they fail.
  const tags = await fetchHashtags(getSupabase(), 12).catch(() => [])
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
      />
    </>
  )
}
