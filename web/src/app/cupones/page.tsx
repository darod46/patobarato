import type { Metadata } from 'next'
import { cache } from 'react'
import { CouponCard } from '../../components/CouponCard'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { PageFaq, PageIntro } from '../../components/PageIntro'
import { fetchCoupons } from '../../lib/coupons'
import { optional } from '../../lib/optional'
import { primary } from '../../lib/primary'
import { defaultH1, fetchPageCopy } from '../../lib/page-copy'
import { listingMetadata } from '../../lib/seo'
import { storeInfo } from '../../lib/stores'
import { getSupabase } from '../../lib/supabase'
import type { Coupon } from '../../lib/types'

export const revalidate = 1800

// Shared by generateMetadata and the page within one request. Optional: a failure renders the default h1.
const loadCopy = cache(async () => (await optional('cupones', () => fetchPageCopy(getSupabase(), 'static', 'cupones'))) ?? null)

export async function generateMetadata(): Promise<Metadata> {
  return listingMetadata({
    kind: 'static',
    slug: 'cupones',
    path: '/cupones',
    copy: await loadCopy(),
    values: {},
    // Always indexable: with no coupons the page keeps its copy and an honest message (spec §6).
    indexable: true,
    fallbackDescription: 'Códigos de descuento vigentes, con sus condiciones y caducidad, comprobados por PatoBarato.',
  })
}

function groupByStore(coupons: Coupon[]): [string, Coupon[]][] {
  const groups = new Map<string, Coupon[]>()
  for (const c of coupons) groups.set(c.store, [...(groups.get(c.store) ?? []), c])
  return [...groups.entries()]
}

export default async function CouponsPage() {
  // The coupons are the primary read: at runtime a failure throws (Next keeps the last ISR version), never an
  // empty page; during the build it renders the honest empty state.
  const [found, copy] = await Promise.all([primary('cupones', () => fetchCoupons(getSupabase())), loadCopy()])
  const coupons = found ?? []
  const year = new Date().getUTCFullYear()
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <PageIntro h1={copy?.h1 ?? defaultH1('static', 'cupones')} copy={copy} values={{}} />
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
        <PageFaq faq={copy?.faq} />
      </main>
      <Footer year={year} stores={coupons.map((c) => c.store)} />
    </div>
  )
}
