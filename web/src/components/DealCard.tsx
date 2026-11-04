import { useState } from 'react'
import { currentPlatform, linkTarget, openAmazon } from '../lib/amazonLink'
import { discountPercent, formatPrice, timeAgo } from '../lib/format'
import type { Deal } from '../lib/types'

const PLACEHOLDER = '/pato-placeholder.svg'
// Few enough to keep every card one line of tags tall.
const MAX_TAGS = 3

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
      {/* Square box whatever the image's aspect ratio; the image never sizes it.
          White box + multiply blends the white background of Amazon photos. */}
      <div className="relative aspect-square overflow-hidden bg-white">
        <img
          src={src}
          alt={deal.title}
          loading="lazy"
          onError={() => setFailed(true)}
          data-placeholder={isPlaceholder || undefined}
          className={
            isPlaceholder
              ? 'absolute inset-0 m-auto h-[55%] w-[55%] object-contain opacity-90'
              : 'absolute inset-0 h-full w-full object-contain p-2 mix-blend-multiply sm:p-3'
          }
        />
        {discount !== null && (
          <span className="absolute top-2 left-2 rounded-full bg-amber px-2 py-0.5 text-xs font-bold text-carbon shadow-sm">
            -{discount}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-zinc-100 p-2.5 sm:gap-2 sm:p-3">
        <h3 className="line-clamp-2 min-h-[2lh] text-[13px] leading-snug font-semibold text-carbon sm:text-sm">
          {deal.title}
        </h3>
        <div>
          <span className="price block text-lg leading-tight font-bold text-carbon sm:text-xl">
            {formatPrice(deal.price)}
          </span>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-zinc-500 sm:text-xs">
            {deal.previousPrice !== null ? (
              <s className="price">{formatPrice(deal.previousPrice)}</s>
            ) : (
              <span />
            )}
            <span className="shrink-0">{timeAgo(deal.publishedAt, now)}</span>
          </div>
        </div>
        {deal.coupon && (
          <div
            data-testid="coupon"
            className="truncate rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 sm:text-xs"
            title={deal.coupon}
          >
            {deal.coupon}
          </div>
        )}
        {deal.hashtags.length > 0 && (
          <div className="flex h-5 flex-wrap gap-1 overflow-hidden">
            {deal.hashtags.slice(0, MAX_TAGS).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] leading-4 text-zinc-600 hover:bg-zinc-200"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <a
          href={deal.affiliateUrl}
          target={linkTarget(platform)}
          rel="sponsored noopener noreferrer"
          onClick={(event) => openAmazon(event, deal.affiliateUrl, platform)}
          className="mt-auto flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-amber px-2 py-2 text-sm font-bold text-carbon shadow-sm transition-colors hover:bg-[#d97706] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
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
    </article>
  )
}
