'use client'

import { useEffect, useRef, useState } from 'react'
import { storeInfo } from '../lib/stores'
import type { Coupon } from '../lib/types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "11 nov" in Europe/Madrid. */
function expiryLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .split('-')
  return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1]}`
}

export function CouponCard({ coupon }: { coupon: Coupon }) {
  const store = storeInfo(coupon.store)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(coupon.code)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 2000)
        return
      } catch {
        // fall through to selecting the text
      }
    }
    // No clipboard API: select the code so the person can copy it by hand.
    const el = codeRef.current
    if (el && typeof window !== 'undefined' && window.getSelection) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{store.short}</span>
        {coupon.expiresAt && <span className="text-muted">Caduca {expiryLabel(coupon.expiresAt)}</span>}
      </div>
      <span className="font-display text-[30px] font-bold leading-none tracking-[-0.02em] text-primary">{coupon.title}</span>
      {coupon.conditions && <p className="text-sm leading-relaxed text-muted">{coupon.conditions}</p>}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <code
          ref={codeRef}
          className="flex h-11 flex-1 items-center rounded-[10px] border border-dashed border-[#b7bcc6] bg-[#fafbfc] px-3 font-display text-[15px] font-semibold tracking-[0.04em] text-ink"
        >
          {coupon.code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {coupon.url && (
        <a
          href={coupon.url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {store.cta}
        </a>
      )}
    </article>
  )
}
