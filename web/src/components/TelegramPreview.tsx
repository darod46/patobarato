import { discountPercent, formatPrice } from '../lib/format'
import type { Deal } from '../lib/types'

export function TelegramPreview({ deal }: { deal: Deal }) {
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-carbon-soft p-5 text-sm text-zinc-100">
      <div className="flex flex-col gap-1.5 rounded-xl bg-carbon p-4 leading-relaxed">
        <p data-line className="font-bold">
          🦆 {deal.title}
        </p>
        <p data-line>
          ✅ Precio: <b>{formatPrice(deal.price)}</b>
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
            <code className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono">{deal.coupon}</code>
          </p>
        )}
        {deal.hashtags.length > 0 && (
          <p data-line className="mt-2 text-amber">
            {deal.hashtags.map((t) => `#${t}`).join(' ')}
          </p>
        )}
      </div>
      <a
        href={deal.affiliateUrl}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="rounded-lg bg-[#2b8a3e] py-2.5 text-center font-semibold text-white hover:bg-[#237032] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        🛒 Ver oferta en Amazon
      </a>
    </div>
  )
}
