import { Trophy } from 'lucide-react'
import { formatPrice } from '../../lib/format'
import { bestOffer } from '../../lib/guides'
import { storeInfo } from '../../lib/stores'
import type { GuideItem } from '../../lib/types'

export function QuickPicks({ items, now }: { items: GuideItem[]; now: Date }) {
  return (
    <section id="eleccion-rapida" aria-labelledby="eleccion-rapida-titulo" className="scroll-mt-24">
      <h2 id="eleccion-rapida-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">
        Nuestra elección rápida
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.slice(0, 3).map((it) => {
          const best = bestOffer(it.stores, now)
          return (
            <li key={it.id} className="flex flex-col gap-1.5 rounded-2xl border border-warm-line bg-warm p-4">
              {it.award && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Trophy size={14} aria-hidden="true" />
                  {it.award}
                </span>
              )}
              <a
                href={`#producto-${it.position}`}
                className="inline-flex min-h-11 items-center font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {it.name}
              </a>
              {best ? (
                <>
                  <span className="price font-display text-2xl font-bold">{formatPrice(best.price)}</span>
                  <span className="text-xs text-muted">{`en ${storeInfo(best.store).short}${best.withCoupon ? ' con cupón' : ''}`}</span>
                </>
              ) : (
                <span className="text-sm text-muted">Sin precio ahora mismo</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
