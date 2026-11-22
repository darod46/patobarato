'use client'

import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { trackCtaClick } from '../lib/cta'
import { TELEGRAM_URL, type CtaPlacement } from '../lib/telegram'

type Props = {
  placement: CtaPlacement
  className?: string
  children: ReactNode
  href?: string
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>

/** Link to the Telegram channel that counts its clicks (primary and middle) without delaying navigation. */
export function TelegramCta({ placement, className, children, href = TELEGRAM_URL, ...rest }: Props) {
  const track = () => trackCtaClick(placement)
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={track} onAuxClick={track}>
      {children}
    </a>
  )
}
