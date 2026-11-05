import { useEffect, useState } from 'react'

/**
 * Current time for relative dates. The first render uses the server render time (`now`, ISO) so
 * hydration matches; the page may be a cached (ISR) render, so after mount it switches to the
 * visitor's clock. Reading it during render would break hydration.
 */
export function useClock(now: string): Date {
  const [clock, setClock] = useState(() => new Date(now))
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setClock(new Date()), [])
  return clock
}
