'use client'

import { useState } from 'react'
import type { CatalogProduct } from '../../lib/catalog'
import { formatPrice } from '../../lib/format'
import { storeInfo } from '../../lib/stores'
import { BuyButton } from '../BuyButton'

const PLACEHOLDER = '/pato-placeholder.svg'

export function CatalogCard({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false)
  const isPlaceholder = failed || !product.imageUrl
  const src = isPlaceholder ? PLACEHOLDER : product.imageUrl!
  const chip = product.origin === 'aliexpress' ? 'AliExpress' : storeInfo(product.store).short

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-shadow hover:shadow-[0_8px_24px_rgba(20,22,26,.08)]">
      <div className="relative aspect-square overflow-hidden bg-white">
        <img
          src={src}
          alt={product.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          data-placeholder={isPlaceholder || undefined}
          className={
            isPlaceholder
              ? 'absolute inset-0 m-auto h-[55%] w-[55%] object-contain opacity-90'
              : 'absolute inset-0 h-full w-full object-contain p-2 mix-blend-multiply sm:p-3'
          }
        />
        {product.originalPrice !== null && product.discountPct !== null && (
          <span className="absolute top-3 left-3 rounded-lg bg-danger px-2.5 py-1 text-[13px] font-bold text-white">
            -{product.discountPct} %
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3 sm:gap-2.5 sm:p-4">
        <span className="text-xs font-semibold text-ink">{chip}</span>
        <h3 className="line-clamp-2 min-h-[2lh] text-[13px] leading-snug font-medium text-ink sm:text-[15px]">
          {product.title}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="price font-display text-xl leading-tight font-bold tracking-[-0.02em] text-ink sm:text-2xl">
            {formatPrice(product.price)}
          </span>
          {product.originalPrice !== null && (
            <s className="price text-xs text-muted sm:text-sm">{formatPrice(product.originalPrice)}</s>
          )}
        </div>
        <BuyButton url={product.affiliateUrl} store={product.store} className="min-h-11 !px-4 !py-2.5 !text-sm" />
      </div>
    </article>
  )
}
