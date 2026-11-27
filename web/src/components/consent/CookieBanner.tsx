'use client'

import { Cookie } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useConsent, writeConsent } from '../../lib/consent'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const BUTTON = `inline-flex min-h-10 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold sm:flex-none ${FOCUS}`

/**
 * Site-wide cookie notice until the reader decides. Not on the deal pages (`/oferta/…`), which people open
 * from Telegram and which load no third-party cookies; the choice made anywhere applies everywhere.
 * Accepting and rejecting are equally easy (same size, same place).
 */
export function CookieBanner() {
  const pathname = usePathname() ?? ''
  const consent = useConsent()
  if (consent !== null || pathname.startsWith('/oferta/') || pathname.startsWith('/diagnostico')) return null
  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[720px] rounded-2xl border border-line bg-white p-4 shadow-[0_12px_32px_rgba(20,22,26,.16)] sm:inset-x-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="flex gap-2 text-sm leading-relaxed text-muted">
          <Cookie size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink" />
          <span>
            Solo usamos cookies de terceros en el buscador de neumáticos de las guías: las pone Awin para atribuir
            las compras como afiliados.{' '}
            <a href="/cookies" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
              Más información
            </a>
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => writeConsent('no')} className={`${BUTTON} border border-line bg-white text-ink hover:bg-surface`}>
            Rechazar
          </button>
          <button type="button" onClick={() => writeConsent('yes')} className={`${BUTTON} bg-primary text-white hover:bg-primary-hover`}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}
