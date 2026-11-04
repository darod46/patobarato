import { useState } from 'react'
import { discountPercent, formatPrice, timeAgo } from '../lib/format'
import type { Deal } from '../lib/types'

const PLACEHOLDER = '/pato-placeholder.svg'

type Props = { deal: Deal; now: Date; onTagClick: (tag: string) => void }

export function DealCard({ deal, now, onTagClick }: Props) {
  const [failed, setFailed] = useState(false)
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  const src = failed || !deal.imageUrl ? PLACEHOLDER : deal.imageUrl

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="aspect-square bg-zinc-50 p-4">
        <img
          src={src}
          alt={deal.title}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 font-bold text-carbon">{deal.title}</h3>
        {deal.coupon && (
          <div
            data-testid="coupon"
            className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-500"
          >
            {deal.coupon}
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="price text-3xl font-bold leading-tight text-carbon">
            {formatPrice(deal.price)}
          </span>
          {deal.previousPrice !== null && (
            <s className="price text-sm text-zinc-400">{formatPrice(deal.previousPrice)}</s>
          )}
          {discount !== null && (
            <span className="rounded-full bg-amber/12 px-2 py-0.5 text-xs font-bold text-amber-ink">
              -{discount}%
            </span>
          )}
        </div>
        {deal.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {deal.hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <span className="text-xs text-zinc-400">{timeAgo(deal.publishedAt, now)}</span>
          <a
            href={deal.affiliateUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-carbon py-2.5 text-sm font-semibold text-white transition-colors hover:bg-carbon-soft"
          >
            Ver en Amazon
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        </div>
      </div>
    </article>
  )
}
