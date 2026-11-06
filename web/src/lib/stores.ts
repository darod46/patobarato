import { STORES, type StoreInfo } from './stores-data'

export { STORES, type StoreInfo }

export function storeInfo(store: string): StoreInfo {
  return STORES[store] ?? { slug: store, name: store, short: store, cta: 'Ver oferta' }
}

/** Store id for a URL slug; null when the slug is not a known store. */
export function storeFromSlug(slug: string): string | null {
  return Object.values(STORES).find((s) => s.slug === slug)?.slug ?? null
}

/** Short names of the given store ids, deduplicated, Amazon first, then in order of appearance. */
export function storeNames(stores: string[]): string[] {
  const ids = [...new Set(stores)]
  const ordered = [...ids.filter((s) => s === 'amazon'), ...ids.filter((s) => s !== 'amazon')]
  return ordered.map((s) => storeInfo(s).short)
}
