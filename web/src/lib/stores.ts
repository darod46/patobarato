export type StoreInfo = { slug: string; name: string; short: string; cta: string }

/** Known stores, keyed by the `store` id used in the database; the slug equals the id. */
export const STORES: Record<string, StoreInfo> = {
  amazon: { slug: 'amazon', name: 'Amazon España', short: 'Amazon', cta: 'Ver en Amazon' },
  aliexpress: { slug: 'aliexpress', name: 'AliExpress', short: 'AliExpress', cta: 'Ir a AliExpress' },
  pccomponentes: { slug: 'pccomponentes', name: 'PcComponentes', short: 'PcComponentes', cta: 'Ir a PcComponentes' },
  mediamarkt: { slug: 'mediamarkt', name: 'MediaMarkt', short: 'MediaMarkt', cta: 'Ir a MediaMarkt' },
  elcorteingles: { slug: 'elcorteingles', name: 'El Corte Inglés', short: 'El Corte Inglés', cta: 'Ir a El Corte Inglés' },
  decathlon: { slug: 'decathlon', name: 'Decathlon', short: 'Decathlon', cta: 'Ir a Decathlon' },
}

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
