import { Store } from 'lucide-react'
import type { StoreStats } from '../lib/stores-data'
import { storeInfo } from '../lib/stores'
import { countLabel } from '../lib/text'

/** Home block listing the stores with data; renders nothing below two stores (nothing to choose). */
export function StoresBlock({ stores }: { stores: StoreStats[] }) {
  if (stores.length < 2) return null
  return (
    <section id="tiendas" className="scroll-mt-32 bg-surface py-14 md:py-16">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 md:px-8">
        <div>
          <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-primary">Tiendas</span>
          <h2 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-[32px]">Elige tu tienda favorita</h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
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
      </div>
    </section>
  )
}
