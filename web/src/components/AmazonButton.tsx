'use client'

import { useEffect, useState } from 'react'
import { currentPlatform, linkTarget, openAmazon, type Platform } from '../lib/amazonLink'
import { storeInfo } from '../lib/stores'

type Props = { url: string; store: string; className?: string }

/** Affiliate button: keeps the v1 per-platform behaviour (Android intent, iOS same tab, desktop new tab). */
export function AmazonButton({ url, store, className = '' }: Props) {
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
      className={`flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-extrabold text-ink shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      {`🛒 ${storeInfo(store).cta}`}
    </a>
  )
}
