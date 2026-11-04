import { useState } from 'react'
import { currentPlatform, linkTarget, openAmazon } from '../lib/amazonLink'
import { discountPercent, formatPrice, timeAgo } from '../lib/format'
import type { Deal } from '../lib/types'

const PLACEHOLDER = '/pato-placeholder.svg'

type Props = { deal: Deal; now: Date; onTagClick: (tag: string) => void }

export function DealCard({ deal, now, onTagClick }: Props) {
  const [failed, setFailed] = useState(false)
  const [platform] = useState(currentPlatform)
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  const isPlaceholder = failed || !deal.imageUrl
  const src = isPlaceholder ? PLACEHOLDER : deal.imageUrl!

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      {/* Square box whatever the image's aspect ratio; the image never sizes it. */}
      <div className="relative aspect-square overflow-hidden bg-zinc-50">
        <img
          src={src}
          alt={deal.title}
          loading="lazy"
          onError={() => setFailed(true)}
          data-placeholder={isPlaceholder || undefined}
          className={
            isPlaceholder
              ? 'absolute inset-0 m-auto h-[55%] w-[55%] object-contain opacity-90'
              : 'absolute inset-0 h-full w-full object-contain p-4'
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 font-bold text-carbon">{deal.title}</h3>
        {deal.coupon && (
          <div
            data-testid="coupon"
            className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600"
          >
            {deal.coupon}
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="price text-3xl font-bold leading-tight text-carbon">
            {formatPrice(deal.price)}
          </span>
          {deal.previousPrice !== null && (
            <s className="price text-sm text-zinc-500">{formatPrice(deal.previousPrice)}</s>
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
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <span className="text-xs text-zinc-500">{timeAgo(deal.publishedAt, now)}</span>
          <a
            href={deal.affiliateUrl}
            target={linkTarget(platform)}
            rel="sponsored noopener noreferrer"
            onClick={(event) => openAmazon(event, deal.affiliateUrl, platform)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber px-4 py-3 text-base font-bold text-carbon shadow-sm transition-colors hover:bg-[#d97706] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6.2" />
            </svg>
            Ver en Amazon
          </a>
        </div>
      </div>
    </article>
  )
}
