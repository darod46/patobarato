import type { Metadata } from 'next'
import { cache } from 'react'
import { Footer } from '../../components/Footer'
import { GuideCard } from '../../components/GuideCard'
import { Header } from '../../components/Header'
import { PageFaq, PageIntro } from '../../components/PageIntro'
import { fetchGuides } from '../../lib/guides-data'
import { defaultH1, fetchPageCopy } from '../../lib/page-copy'
import { breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { optional } from '../../lib/optional'
import { primary } from '../../lib/primary'

// Regenerated at most every 60 s, like the listings.
export const revalidate = 3600

// Shared by generateMetadata and the page within one request. Optional: a failure renders the default h1.
const loadCopy = cache(async () => (await optional('guias', () => fetchPageCopy(getSupabase(), 'static', 'guias'))) ?? null)

export async function generateMetadata(): Promise<Metadata> {
  return listingMetadata({
    kind: 'static',
    slug: 'guias',
    path: '/guias',
    copy: await loadCopy(),
    values: {},
    // Always indexable: with no guides the page keeps its copy and an honest message (spec §6).
    indexable: true,
    fallbackDescription: 'Guías de compra con los mejores productos, sus precios revisados y los cupones que aplican, por PatoBarato.',
  })
}

export default async function GuidesPage() {
  // The guides are the primary read: at runtime a failure throws (Next keeps the last ISR version), never an
  // empty page; during the build it renders the honest empty state.
  const [found, stores, copy] = await Promise.all([
    primary('guias', () => fetchGuides(getSupabase())),
    optional('guias', () => fetchStores(getSupabase())),
    loadCopy(),
  ])
  const guides = found ?? []
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Guías', path: '/guias' },
  ])
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <PageIntro h1={copy?.h1 ?? defaultH1('static', 'guias')} copy={copy} values={{}} />
        {guides.length > 0 ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {guides.map((g) => (
              <li key={g.slug}>
                <GuideCard guide={g} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">Todavía no hay guías publicadas</p>
        )}
        <PageFaq faq={copy?.faq} />
      </main>
      <Footer year={new Date().getUTCFullYear()} stores={(stores ?? []).map((s) => s.store)} />
    </div>
  )
}
