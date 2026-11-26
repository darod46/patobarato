import { Check, ThumbsDown, ThumbsUp, Trophy, X } from 'lucide-react'
import { formatPrice } from '../../lib/format'
import { bestOffer, discountPct, isLowest } from '../../lib/guides'
import { storeInfo } from '../../lib/stores'
import type { GuideItem } from '../../lib/types'
import { Markdown } from '../Markdown'
import { StoreRow } from './StoreRow'

export function GuideItemCard({ item, index, now }: { item: GuideItem; index: number; now: Date }) {
  const best = bestOffer(item.stores, now)
  // Badge and lowest tag use the winning offer's listed price (never the coupon price) against its own history.
  const winner = best?.offer
  const discount = winner ? discountPct(winner.price, winner.previousPrice) : null
  const lowest = winner && winner.price !== null ? isLowest(winner.price, winner.previousMinPrice) : false
  const discountBadge = discount !== null && (
    <span
      aria-label={`Descuento del ${discount} %`}
      className="absolute top-2 right-2 rounded-lg bg-danger px-2 py-0.5 text-xs font-bold text-white sm:right-auto sm:left-2"
    >{`-${discount} %`}</span>
  )

  return (
    <section id={`producto-${item.position}`} aria-labelledby={`producto-${item.position}-titulo`} className={`scroll-mt-24 rounded-3xl border bg-white p-5 shadow-[0_2px_12px_rgba(20,22,26,0.05)] md:p-6 ${index === 1 ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        {item.imageUrl ? (
          <div className="relative mx-auto aspect-square w-full max-w-40 overflow-hidden rounded-xl border border-line bg-white">
            <img
              src={item.imageUrl}
              alt={item.name}
              width={320}
              height={320}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply"
            />
            {discountBadge}
          </div>
        ) : (
          // No licensed photo (Amazon images need its API): the rank and award stand in for it.
          <div
            data-testid="rank-tile"
            className="relative flex items-center gap-3 rounded-xl border border-warm-line bg-warm px-4 py-3 sm:aspect-square sm:flex-col sm:justify-center sm:gap-2 sm:p-4 sm:text-center"
          >
            <span aria-hidden="true" className="font-display text-4xl leading-none font-bold text-primary sm:text-6xl">
              {index}
            </span>
            {item.award && (
              <span className="flex items-center gap-1.5 text-sm leading-tight font-bold text-ink sm:flex-col sm:gap-1">
                <Trophy size={18} aria-hidden="true" className="shrink-0 text-accent-ink" />
                {item.award}
              </span>
            )}
            {discountBadge}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {item.award && item.imageUrl && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <Trophy size={14} aria-hidden="true" />
              {item.award}
            </span>
          )}
          <h3 id={`producto-${item.position}-titulo`} className="font-display text-xl font-bold tracking-[-0.02em]">
            {/* The rank tile already shows the number; screen readers still get it. */}
            <span className={item.imageUrl ? undefined : 'sr-only'}>{`${index}.`}</span> {item.name}
          </h3>
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {item.pros.length > 0 && (
            <div className="rounded-2xl bg-success-soft/60 p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-success">
                <ThumbsUp size={16} aria-hidden="true" />
                Lo mejor
              </h4>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-sm">
                {item.pros.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.cons.length > 0 && (
            <div className="rounded-2xl bg-[#fdecea]/70 p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-danger">
                <ThumbsDown size={16} aria-hidden="true" />
                Lo peor
              </h4>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-sm">
                {item.cons.map((c) => (
                  <li key={c} className="flex gap-2">
                    <X size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
