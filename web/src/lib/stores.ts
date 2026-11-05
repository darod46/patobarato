export type StoreInfo = { name: string; short: string; cta: string }

export const STORES: Record<string, StoreInfo> = {
  amazon: { name: 'Amazon España', short: 'Amazon', cta: 'Ver en Amazon' },
}

export function storeInfo(store: string): StoreInfo {
  return STORES[store] ?? { name: store, short: store, cta: 'Ver oferta' }
}
