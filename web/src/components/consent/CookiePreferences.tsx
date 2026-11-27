'use client'

import { useConsent, writeConsent } from '../../lib/consent'

const LABEL = { yes: 'Has aceptado las cookies de Awin.', no: 'Has rechazado las cookies de Awin.' } as const

/** On the cookie policy: the current choice and a button that forgets it, so the banner asks again. */
export function CookiePreferences() {
  const consent = useConsent()
  if (!consent) return null
  return (
    <p>
      {LABEL[consent]}{' '}
      <button type="button" onClick={() => writeConsent(null)} className="font-semibold text-primary underline underline-offset-2">
        Cambiar mi elección
      </button>
    </p>
  )
}
