export type StoreInfo = { name: string; short: string; cta: string }

export const STORES: Record<string, StoreInfo> = {
  amazon: { name: 'Amazon España', short: 'Amazon', cta: 'Ver en Amazon' },
  aliexpress: { name: 'AliExpress', short: 'AliExpress', cta: 'Ir a AliExpress' },
  pccomponentes: { name: 'PcComponentes', short: 'PcComponentes', cta: 'Ir a PcComponentes' },
  mediamarkt: { name: 'MediaMarkt', short: 'MediaMarkt', cta: 'Ir a MediaMarkt' },
  elcorteingles: { name: 'El Corte Inglés', short: 'El Corte Inglés', cta: 'Ir a El Corte Inglés' },
  decathlon: { name: 'Decathlon', short: 'Decathlon', cta: 'Ir a Decathlon' },
}

export function storeInfo(store: string): StoreInfo {
  return STORES[store] ?? { name: store, short: store, cta: 'Ver oferta' }
}

/** Short names of the given store ids, deduplicated, Amazon first, then in order of appearance. */
export function storeNames(stores: string[]): string[] {
  const ids = [...new Set(stores)]
  const ordered = [...ids.filter((s) => s === 'amazon'), ...ids.filter((s) => s !== 'amazon')]
  return ordered.map((s) => storeInfo(s).short)
}
