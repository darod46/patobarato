import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { Footer } from '../../../../components/Footer'
import { Header } from '../../../../components/Header'
import { ProductView } from '../../../../components/ProductView'
import { SearchForm } from '../../../../components/SearchForm'
import { fetchDealByProduct, fetchRelatedDeals } from '../../../../lib/deals'
import { breadcrumbJsonLd, jsonLdScript, productJsonLd, productMetadata, type BreadcrumbItem } from '../../../../lib/seo'
import { getSupabase } from '../../../../lib/supabase'
import { SITE_URL, parseProductSlug, productPath, tagPath } from '../../../../lib/urls'

// Product pages render on demand and are regenerated at most every 10 minutes.
export const revalidate = 600

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ store: string; slug: string }> }

// Shared by generateMetadata and the page within one request.
const loadDeal = cache(async (store: string, slug: string) => {
  const parsed = parseProductSlug(store, slug)
  if (!parsed) return null
  return fetchDealByProduct(getSupabase(), store, parsed.id)
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, slug } = await params
  const deal = await loadDeal(store, slug)
  if (!deal) notFound()
  return productMetadata(deal)
}

export default async function ProductPage({ params }: Props) {
  const { store, slug } = await params
  const deal = await loadDeal(store, slug)
  if (!deal) notFound()

  // Exact slug and lowercase id; anything else (old title, uppercase ASIN) goes to the canonical URL.
  const canonical = productPath(deal)
  if (`/oferta/${store}/${slug}` !== canonical) permanentRedirect(canonical)

  // Related deals are optional: a failed query must not turn the product page into a 500.
  const related = await fetchRelatedDeals(getSupabase(), deal, 10).catch(() => [])
  const now = new Date().toISOString()
  const tag = deal.hashtags[0]
  const crumbs: BreadcrumbItem[] = [
    { name: 'Inicio', path: '/' },
    ...(tag ? [{ name: `#${tag}`, path: tagPath(tag) }] : []),
    { name: deal.title, path: canonical },
  ]

  return (
    // Bottom padding on mobile keeps the footer clear of the fixed "Ver en Amazon" bar.
    <div className="min-h-screen bg-surface pb-24 font-sans text-ink md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(productJsonLd(deal, SITE_URL + canonical))}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbJsonLd(crumbs))} />
      <Header search={<SearchForm />} />
      <main className="mx-auto max-w-[1200px] px-4 pt-32 pb-12 md:px-8 md:pt-24 md:pb-16">
        <ProductView deal={deal} related={related} now={now} />
      </main>
      <Footer year={new Date(now).getUTCFullYear()} />
    </div>
  )
}
