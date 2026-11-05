'use client'

import Link from 'next/link'
import { useState } from 'react'
import { discountPercent, formatPrice, timeAgo } from '../lib/format'
import { storeInfo } from '../lib/stores'
import type { Deal } from '../lib/types'
import { productPath } from '../lib/urls'

const PLACEHOLDER = '/pato-placeholder.svg'
type Props = { deal: Deal; now: Date }

export function DealCard({ deal, now }: Props) {
  const [failed, setFailed] = useState(false)
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  const isPlaceholder = failed || !deal.imageUrl
  const src = isPlaceholder ? PLACEHOLDER : deal.imageUrl!

  return (
    <Link
      href={productPath(deal)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon"
    >
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
        <h3 className="line-clamp-2 group-hover:underline min-h-[2lh] text-[13px] leading-snug font-semibold text-carbon sm:text-sm">
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
            <span className="shrink-0">{storeInfo(deal.store).short} · {timeAgo(deal.publishedAt, now)}</span>
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
      </div>
    </Link>
  )
}
