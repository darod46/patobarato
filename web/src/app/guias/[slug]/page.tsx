import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { GuideView } from '../../../components/GuideView'
import { guidePath, hasFreshPrices } from '../../../lib/guides'
import { fetchGuide } from '../../../lib/guides-data'
import { breadcrumbJsonLd, guideJsonLd, guideMetadata, jsonLdScript } from '../../../lib/seo'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'
import { SITE_URL } from '../../../lib/urls'

// Regenerated at most every 60 s, like the listings.
export const revalidate = 60

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

// Shared by generateMetadata and the page within one request. Null means 404 (unknown slug).
const loadGuide = cache(async (slug: string) => fetchGuide(getSupabase(), slug))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await loadGuide((await params).slug)
  if (!guide) notFound()
  return guideMetadata(guide, hasFreshPrices(guide.pricesCheckedAt, new Date()))
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const [guide, stores] = await Promise.all([loadGuide(slug), optional(() => fetchStores(getSupabase()))])
  if (!guide) notFound()
  const now = new Date()
  const path = guidePath(guide.slug)
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Guías', path: '/guias' },
    { name: guide.title, path },
  ])
  return (
    <>
      {[...guideJsonLd(guide, SITE_URL + path), crumbs].map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(data)} />
      ))}
      <GuideView guide={guide} now={now} stores={(stores ?? []).map((s) => s.store)} />
    </>
  )
}
