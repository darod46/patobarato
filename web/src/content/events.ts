/** Static calendar of shopping events shown on the home page. Dates are calendar days in Europe/Madrid. */
export type SiteEvent = {
  id: string
  name: string
  /** YYYY-MM-DD */
  date: string
  /** Store ids (see lib/stores.ts) the event is relevant for; empty when it is general. */
  stores: string[]
  /** Date not yet announced: only the month is shown. */
  approximate?: boolean
}

export const EVENTS: SiteEvent[] = [
  { id: 'aliexpress-1111', name: '11.11 AliExpress', date: '2026-11-11', stores: ['aliexpress'] },
  { id: 'black-friday', name: 'Black Friday', date: '2026-11-27', stores: ['amazon', 'pccomponentes', 'mediamarkt'] },
  { id: 'cyber-monday', name: 'Cyber Monday', date: '2026-11-30', stores: ['amazon', 'pccomponentes'] },
  { id: 'rebajas-enero', name: 'Rebajas de enero', date: '2027-01-07', stores: [] },
  { id: 'prime-day', name: 'Prime Day', date: '2027-07-01', stores: ['amazon'], approximate: true },
]
