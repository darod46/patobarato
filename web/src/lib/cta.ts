import type { CtaPlacement } from './telegram'

const ENDPOINT = '/api/clic'

/** Fire-and-forget count of a Telegram CTA click; never throws and never delays navigation. */
export function trackCtaClick(placement: CtaPlacement, path: string = location.pathname): void {
  try {
    const payload = JSON.stringify({ placement, path })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon(ENDPOINT, blob)) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // tracking must never break the click
  }
}
