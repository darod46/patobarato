'use client'

import { ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { currentPlatform, linkTarget, openAmazon, type Platform } from '../lib/amazonLink'
import { storeInfo } from '../lib/stores'

type Variant = 'primary' | 'secondary'

type Props = {
  url: string
  store: string
  className?: string
  /** `secondary`: white, bordered link (e.g. an ended deal's "current price" link). */
  variant?: Variant
  /** Overrides the store's CTA text. */
  label?: string
}

const BASE =
  'flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const STYLES: Record<Variant, string> = {
  primary: `${BASE} bg-accent font-extrabold shadow-sm hover:bg-accent/90`,
  secondary: `${BASE} border border-line bg-white font-semibold hover:bg-surface`,
}

/** Buy button: Amazon keeps the per-platform behaviour; every other store is a plain new-tab link. */
export function BuyButton({ url, store, className = '', variant = 'primary', label }: Props) {
  const style = `${STYLES[variant]} ${className}`
  const text = label ?? storeInfo(store).cta
  if (store !== 'amazon') {
    return (
      <a href={url} target="_blank" rel="sponsored noopener noreferrer" className={style}>
        <ShoppingCart size={18} aria-hidden="true" />
        {text}
      </a>
    )
  }
  return <AmazonLink url={url} className={style} label={text} />
}

/** Keeps the v1 per-platform behaviour (Android intent, iOS same tab, desktop new tab). */
function AmazonLink({ url, className, label }: { url: string; className: string; label: string }) {
  // The server cannot know the device: it renders desktop attributes and the real
  // platform is applied after mount, so hydration always matches.
  const [platform, setPlatform] = useState<Platform>('desktop')
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setPlatform(currentPlatform()), [])

  return (
    <a
      href={url}
      target={linkTarget(platform)}
      rel="sponsored noopener noreferrer"
      onClick={(event) => openAmazon(event, url, platform)}
      className={className}
    >
      <ShoppingCart size={18} aria-hidden="true" />
      {label}
    </a>
  )
}
