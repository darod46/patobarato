import type { Metadata } from 'next'
import { Store } from 'lucide-react'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { breadcrumbJsonLd, jsonLdScript, storesMetadata } from '../../lib/seo'
import { storeInfo } from '../../lib/stores'
import { fetchStores, type StoreStats } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { countLabel } from '../../lib/text'

// Regenerated at most every 60 s, like the listings.
export const revalidate = 60

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

const loadStores = () => optional(() => fetchStores(getSupabase()))

export async function generateMetadata(): Promise<Metadata> {
  return storesMetadata((await loadStores())?.length ?? 0)
}

function StoresIndex({ stores }: { stores: StoreStats[] | undefined }) {
  if (!stores) {
    return (
      <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">Ahora mismo no podemos cargar las tiendas.</p>
    )
  }
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
  const stores = await loadStores()
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Tiendas', path: '/tiendas' },
  ])
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header search={null} />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">Tiendas</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Las tiendas de las que publicamos chollos y cupones. Los recuentos son los de ahora mismo.
        </p>
        <StoresIndex stores={stores} />
      </main>
      <Footer year={new Date().getUTCFullYear()} stores={(stores ?? []).map((s) => s.store)} />
    </div>
  )
}
