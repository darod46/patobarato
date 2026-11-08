import { discountPercent, formatPrice } from '../lib/format'
import type { Deal } from '../lib/types'

export function TelegramPreview({ deal }: { deal: Deal }) {
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  return (
    <div className="rounded-2xl bg-[#2b3039] p-5 text-sm text-white">
      <div className="flex flex-col gap-1.5 rounded-xl bg-ink p-4 leading-relaxed">
        <p data-line className="font-bold">
          {deal.title}
        </p>
        <p data-line>
          ✅ {deal.priceBeforeCoupon ? 'Precio sin cupón' : 'Precio'}: <b>{formatPrice(deal.price)}</b>
        </p>
        {deal.previousPrice !== null && (
          <p data-line>
            ❌ Antes: <s>{formatPrice(deal.previousPrice)}</s>
            {discount !== null && ` (-${discount}%)`}
          </p>
        )}
        {deal.coupon && (
          <p data-line>
            🎟️ Cupón:{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono">{deal.coupon}</code>
          </p>
        )}
        <p data-line>
          🛒 Ver en Amazon:{' '}
          <a
            href={deal.affiliateUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="break-all text-[#6ab3f3] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {deal.affiliateUrl}
          </a>
        </p>
        {deal.hashtags.length > 0 && (
          <p data-line className="mt-2 text-accent">
            {deal.hashtags.map((t) => `#${t}`).join(' ')}
          </p>
        )}
      </div>
    </div>
  )
}
