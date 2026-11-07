import { formatPrice } from '../../lib/format'
import { finalPrice, isRecent } from '../../lib/guides'
import { storeInfo } from '../../lib/stores'
import type { GuideCoupon, GuideStoreOffer } from '../../lib/types'
import { BuyButton } from '../BuyButton'

const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

/** Coupon value in Spanish: "−10 € en 100 €", "−10 €", "−5 %"; empty when the coupon has no structured value. */
function couponValueText(coupon: GuideCoupon): string {
  if (coupon.discountAmount !== null && coupon.discountAmount > 0) {
    const base = `−${NUMBER.format(coupon.discountAmount)} €`
    return coupon.minPurchase !== null ? `${base} en ${NUMBER.format(coupon.minPurchase)} €` : base
  }
  if (coupon.discountPct !== null && coupon.discountPct > 0) return `−${NUMBER.format(coupon.discountPct)} %`
  return ''
}

/** Amazon goes through the /go/ redirect (affiliate tag); other stores use their canonical URL. */
function buyUrl(offer: GuideStoreOffer): string {
  return offer.store === 'amazon' ? `/go/${offer.externalId}` : offer.url
}

function StoreName({ offer }: { offer: GuideStoreOffer }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-semibold text-ink">{storeInfo(offer.store).short}</span>
      {offer.note && <span className="text-xs text-muted">{offer.note}</span>}
    </div>
  )
}

export function StoreRow({ offer, now }: { offer: GuideStoreOffer; now: Date }) {
  const store = storeInfo(offer.store)
  if (!isRecent(offer, now) || offer.price === null) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
        <StoreName offer={offer} />
        <a
          href={buyUrl(offer)}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-primary-soft px-4 text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {`Ver en ${store.short}`}
        </a>
      </li>
    )
  }

  const final = finalPrice(offer.price, offer.coupon, now)
  const value = offer.coupon ? couponValueText(offer.coupon) : ''
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <StoreName offer={offer} />
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="price font-display text-xl font-bold">{formatPrice(offer.price)}</span>
          {offer.previousPrice !== null && offer.previousPrice > offer.price && (
            <s className="price text-sm text-muted">{formatPrice(offer.previousPrice)}</s>
          )}
        </div>
        {offer.coupon && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/20 px-2 py-1 font-semibold text-accent-ink">
              <code className="font-display tracking-[0.04em]">{offer.coupon.code}</code>
              {value && <span>{value}</span>}
            </span>
            {final !== null && <span className="price font-semibold text-success">{`Te queda en ${formatPrice(final)}`}</span>}
          </div>
        )}
      </div>
      <BuyButton url={buyUrl(offer)} store={offer.store} className="sm:min-h-11 sm:px-5 sm:py-2.5" />
    </li>
  )
}
