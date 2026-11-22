import type { Metadata } from 'next'
import { Store } from 'lucide-react'
import { cache } from 'react'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { PageFaq, PageIntro } from '../../components/PageIntro'
import { defaultH1, fetchPageCopy, type CopyValues } from '../../lib/page-copy'
import { breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../lib/seo'
import { storeInfo } from '../../lib/stores'
import { fetchStores, type StoreStats } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { countLabel } from '../../lib/text'
import { optional } from '../../lib/optional'
import { primary } from '../../lib/primary'

// Regenerated at most every 60 s, like the listings.
export const revalidate = 60

// Shared by generateMetadata and the page within one request. The stores are the primary read: a failure
// throws at runtime (Next keeps the last ISR version); during the build it renders the empty state. The copy is secondary.
const loadStores = cache(async () => (await primary('tiendas', () => fetchStores(getSupabase()))) ?? [])
const loadCopy = cache(async () => (await optional('tiendas', () => fetchPageCopy(getSupabase(), 'static', 'tiendas'))) ?? null)

/** Live totals for the copy markers; 0 deals is no value (the sentence is dropped). */
function copyValues(stores: StoreStats[]): CopyValues {
  const total = stores.reduce((sum, s) => sum + s.deals, 0)
  return { deals: total > 0 ? total : null, stores: stores.filter((s) => s.deals > 0).map((s) => s.store) }
}

export async function generateMetadata(): Promise<Metadata> {
  const [stores, copy] = await Promise.all([loadStores(), loadCopy()])
  return listingMetadata({
    kind: 'static',
    slug: 'tiendas',
    path: '/tiendas',
    copy,
    values: copyValues(stores),
    // Always indexable: an empty list still has the editorial copy and an honest message (spec §6).
    indexable: true,
    fallbackDescription: 'Las tiendas de las que PatoBarato publica chollos y cupones, con lo que hay ahora en cada una.',
  })
}

function StoresIndex({ stores }: { stores: StoreStats[] }) {
  if (stores.length === 0) {
    return (
      <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">
        Todavía no hay chollos ni cupones activos de ninguna tienda.
      </p>
    )
  }
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {stores.map((s) => {
        const info = storeInfo(s.store)
        return (
          <li key={s.store}>
            <a
              href={`/tiendas/${info.slug}`}
              className="flex min-h-11 items-center gap-4 rounded-2xl border border-line bg-white p-5 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-primary">
                <Store size={22} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="font-display text-lg font-bold text-ink">{info.name}</span>
                <span className="text-sm text-muted">
                  {countLabel(s.deals, 'chollo', 'chollos')} · {countLabel(s.coupons, 'cupón', 'cupones')}
                </span>
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export default async function StoresPage() {
  const [stores, copy] = await Promise.all([loadStores(), loadCopy()])
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Tiendas', path: '/tiendas' },
  ])
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <PageIntro h1={copy?.h1 ?? defaultH1('static', 'tiendas')} copy={copy} values={copyValues(stores)} />
        <StoresIndex stores={stores} />
        <PageFaq faq={copy?.faq} />
      </main>
      <Footer year={new Date().getUTCFullYear()} stores={stores.map((s) => s.store)} />
    </div>
  )
}
