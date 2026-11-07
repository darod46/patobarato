import type { Metadata } from 'next'
import { DealCard } from '../../../../components/DealCard'
import { Footer } from '../../../../components/Footer'
import { Header } from '../../../../components/Header'
import { fetchDeals } from '../../../../lib/deals'
import { getSupabase } from '../../../../lib/supabase'
import type { Deal } from '../../../../lib/types'

export const metadata: Metadata = {
  title: 'Oferta no disponible · PatoBarato',
  robots: { index: false },
}

async function currentDeals(): Promise<Deal[]> {
  try {
    const { deals } = await fetchDeals(getSupabase(), { page: 0 })
    return deals.slice(0, 5)
  } catch {
    // The 404 page must render even when the data source is unavailable.
    return []
  }
}

export default async function ProductNotFound() {
  const deals = await currentDeals()
  const now = new Date()

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-32 pb-16 md:px-8 md:pt-24">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <img src="/pato-placeholder.svg" alt="" width={120} height={120} className="h-28 w-28" />
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-3xl">Esta oferta ya ha volado</h1>
          <p className="text-muted">Pero el pato sigue cazando: mira los chollos de hoy.</p>
          <a
            href="/"
            className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ver los chollos de hoy
          </a>
        </div>
        {deals.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-5 font-display text-2xl font-bold tracking-[-0.02em]">Chollos de hoy</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
              {deals.map((d) => (
                <DealCard key={d.publicationId} deal={d} now={now} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer year={now.getUTCFullYear()} />
    </div>
  )
}
