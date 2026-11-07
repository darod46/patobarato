import type { Metadata } from 'next'
import { CouponCard } from '../../components/CouponCard'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { fetchCoupons } from '../../lib/coupons'
import { couponsMetadata } from '../../lib/seo'
import { storeInfo } from '../../lib/stores'
import { getSupabase } from '../../lib/supabase'
import type { Coupon } from '../../lib/types'

export const revalidate = 600

/** Resolves to [] on any failure, so the page always renders (with the empty state). */
async function loadCoupons(): Promise<Coupon[]> {
  try {
    return await fetchCoupons(getSupabase())
  } catch {
    return []
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return couponsMetadata((await loadCoupons()).length)
}

function groupByStore(coupons: Coupon[]): [string, Coupon[]][] {
  const groups = new Map<string, Coupon[]>()
  for (const c of coupons) groups.set(c.store, [...(groups.get(c.store) ?? []), c])
  return [...groups.entries()]
}

export default async function CouponsPage() {
  const coupons = await loadCoupons()
  const year = new Date().getUTCFullYear()
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">Cupones vigentes</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Códigos de descuento que hemos comprobado, con sus condiciones y su caducidad. Se aplican en el carrito de cada tienda.
        </p>
        {coupons.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">
            Ahora mismo no hay cupones vigentes. Los publicamos en el canal en cuanto salen.
          </p>
        ) : (
          groupByStore(coupons).map(([store, list]) => (
            <section key={store} className="mt-10">
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{storeInfo(store).name}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {list.map((coupon) => (
                  <CouponCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
      <Footer year={year} stores={coupons.map((c) => c.store)} />
    </div>
  )
}
