import { Sparkles, Trophy } from 'lucide-react'
import { formatPrice } from '../../lib/format'
import { bestOffer } from '../../lib/guides'
import { storeInfo } from '../../lib/stores'
import type { GuideItem } from '../../lib/types'
import { SectionHeading } from './SectionHeading'

export function QuickPicks({ items, now }: { items: GuideItem[]; now: Date }) {
  return (
    <section id="eleccion-rapida" aria-labelledby="eleccion-rapida-titulo" className="scroll-mt-24">
      <SectionHeading id="eleccion-rapida-titulo" icon={Sparkles}>
        Nuestra elección rápida
      </SectionHeading>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {items.slice(0, 3).map((it, i) => {
          const best = bestOffer(it.stores, now)
          return (
            <li
              key={it.id}
              className="relative flex flex-col gap-1.5 rounded-2xl border border-warm-line bg-warm p-4 pt-5 shadow-[0_2px_10px_rgba(61,46,0,0.06)] transition-shadow hover:shadow-[0_6px_18px_rgba(61,46,0,0.10)]"
            >
              <span
                aria-hidden="true"
                className="absolute -top-3 left-4 flex size-7 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-white shadow-sm"
              >
                {i + 1}
              </span>
              {it.award && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-ink">
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
                <span className="mt-auto text-sm text-muted">Consulta el precio en la tienda</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
