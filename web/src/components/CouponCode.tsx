'use client'

import { Check, Copy, Ticket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * The code inside a deal's coupon text: an upper-case token of letters and digits (ESBF02, IFPGXPMU,
 * "Código PATO5" gives PATO5). Free text such as «y pagando con PayPal» has none.
 */
export function couponCode(coupon: string): string | null {
  const tokens = coupon.split(/[\s,.:;()«»"']+/).filter((t) => /^[A-Z0-9]{4,20}$/.test(t) && /[A-Z]/.test(t))
  return tokens.at(-1) ?? null
}

const BOX =
  'flex w-full max-w-sm items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-accent/15 px-4 py-2.5 text-left'

/** A deal's coupon: a big tap-to-copy code when there is one, otherwise the coupon text, still easy to see. */
export function CouponCode({ coupon }: { coupon: string }) {
  const code = couponCode(coupon)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!code) {
    return (
      <p data-testid="coupon" className={BOX}>
        <Ticket size={20} aria-hidden="true" className="shrink-0 text-accent-ink" />
        <span className="text-sm text-ink">
          <span className="font-semibold">Cupón: </span>
          {coupon}
        </span>
      </p>
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard access: select the code so it can be copied by hand.
      const el = codeRef.current
      const selection = window.getSelection?.()
      if (el && selection) {
        const range = document.createRange()
        range.selectNodeContents(el)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }

  return (
    <button
      type="button"
      data-testid="coupon"
      onClick={copy}
      aria-label={copied ? `Cupón ${code} copiado` : `Copiar el cupón ${code}`}
      className={`${BOX} transition-colors hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      <Ticket size={20} aria-hidden="true" className="shrink-0 text-accent-ink" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-muted">Cupón</span>
        <code ref={codeRef} className="truncate font-display text-lg font-bold tracking-[0.06em] text-ink">
          {code}
        </code>
      </span>
      <span aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-sm font-semibold text-ink shadow-sm">
        {copied ? <Check size={16} aria-hidden="true" className="text-success" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar'}
      </span>
    </button>
  )
}
