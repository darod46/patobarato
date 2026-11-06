'use client'

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { formatPrice, timeAgo } from '../lib/format'
import { storeInfo } from '../lib/stores'
import type { Deal } from '../lib/types'
import { productPath } from '../lib/urls'

const PLACEHOLDER = '/pato-placeholder.svg'
type Props = { deal: Deal; now: Date }

export function DealCard({ deal, now }: Props) {
  const [failed, setFailed] = useState(false)
  const isPlaceholder = failed || !deal.imageUrl
  const src = isPlaceholder ? PLACEHOLDER : deal.imageUrl!

  return (
    <Link
      href={productPath(deal)}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-shadow hover:shadow-[0_8px_24px_rgba(20,22,26,.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
        {deal.discountPct !== null && (
          <span className="absolute top-3 left-3 rounded-lg bg-danger px-2.5 py-1 text-[13px] font-bold text-white">
            -{deal.discountPct}%
          </span>
        )}
        {deal.coupon && (
          <span
            data-testid="coupon-chip"
            className="absolute top-3 right-3 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink"
          >
            Cupón
          </span>
        )}
        {deal.isLowest && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
            Mínimo histórico
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3 sm:gap-2.5 sm:p-4">
        <span className="flex justify-between text-xs text-muted">
          <span className="font-semibold text-ink">{storeInfo(deal.store).short}</span>
          <span>{timeAgo(deal.publishedAt, now)}</span>
        </span>
        <h3 className="line-clamp-2 min-h-[2lh] text-[13px] leading-snug font-medium text-ink group-hover:underline sm:text-[15px]">
          {deal.title}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="price font-display text-xl leading-tight font-bold tracking-[-0.02em] text-ink sm:text-2xl">
            {formatPrice(deal.price)}
          </span>
          {deal.previousPrice !== null && (
            <s className="price text-xs text-muted sm:text-sm">{formatPrice(deal.previousPrice)}</s>
          )}
        </div>
        {deal.coupon && (
          <div
            data-testid="coupon"
            className="truncate rounded-md bg-surface px-2 py-1 text-[11px] text-muted sm:text-xs"
            title={deal.coupon}
          >
            {deal.coupon}
          </div>
        )}
        <span className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-primary-soft text-sm font-semibold text-primary group-hover:bg-[#e3e9fa]">
          Ver chollo
          <ArrowUpRight size={16} aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}
