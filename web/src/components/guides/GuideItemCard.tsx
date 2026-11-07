import { ThumbsDown, ThumbsUp, Trophy } from 'lucide-react'
import { formatPrice } from '../../lib/format'
import { bestOffer, discountPct, isLowest, isRecent } from '../../lib/guides'
import { storeInfo } from '../../lib/stores'
import type { GuideItem } from '../../lib/types'
import { Markdown } from '../Markdown'
import { StoreRow } from './StoreRow'

export function GuideItemCard({ item, index, now }: { item: GuideItem; index: number; now: Date }) {
  const best = bestOffer(item.stores, now)
  // Badge and lowest tag come from the offer that gives the best price.
  const source = best ? item.stores.find((s) => s.store === best.store && isRecent(s, now)) : undefined
  const discount = source ? discountPct(source.price, source.previousPrice) : null
  const lowest = source && source.price !== null ? isLowest(best!.price, source.previousMinPrice) : false

  return (
    <section id={`producto-${item.position}`} aria-labelledby={`producto-${item.position}-titulo`} className="scroll-mt-24 rounded-2xl border border-line bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="relative mx-auto aspect-square w-full max-w-40 overflow-hidden rounded-xl border border-line bg-white">
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name} width={320} height={320} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply" />
          )}
          {discount !== null && (
            <span className="absolute top-2 left-2 rounded-lg bg-danger px-2 py-0.5 text-xs font-bold text-white">{`-${discount} %`}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {item.award && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <Trophy size={14} aria-hidden="true" />
              {item.award}
            </span>
          )}
          <h3 id={`producto-${item.position}-titulo`} className="font-display text-xl font-bold tracking-[-0.02em]">{`${index}. ${item.name}`}</h3>
          {best && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-semibold text-muted">Mejor precio hoy</span>
              <span className="price font-display text-2xl font-bold">{formatPrice(best.price)}</span>
              <span className="text-xs text-muted">{`en ${storeInfo(best.store).short}${best.withCoupon ? ' con cupón' : ''}`}</span>
              {lowest && (
                <span className="rounded-lg bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">Mínimo de los últimos 90 días</span>
              )}
            </div>
          )}
          {item.specs.length > 0 && (
            <ul aria-label="Características" className="flex flex-wrap gap-2">
              {item.specs.map((s) => (
                <li key={s.label} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink">{`${s.label}: ${s.value}`}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {item.stores.length > 0 && (
        <ul aria-label="Dónde comprarlo" className="mt-4 flex flex-col gap-2">
          {item.stores.map((o) => (
            <StoreRow key={`${o.store}-${o.externalId}`} offer={o} now={now} />
          ))}
        </ul>
      )}

      <Markdown source={item.summaryMd} className="mt-4" />

      {(item.pros.length > 0 || item.cons.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {item.pros.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-success">
                <ThumbsUp size={16} aria-hidden="true" />
                Lo mejor
              </h4>
              <ul className="mt-2 list-disc pl-5 text-sm">{item.pros.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {item.cons.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-danger">
                <ThumbsDown size={16} aria-hidden="true" />
                Lo peor
              </h4>
              <ul className="mt-2 list-disc pl-5 text-sm">{item.cons.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
