export type StoreInfo = { name: string; cta: string }

export const STORES: Record<string, StoreInfo> = {
  amazon: { name: 'Amazon España', cta: 'Ver en Amazon' },
}

export function storeInfo(store: string): StoreInfo {
  return STORES[store] ?? { name: store, cta: 'Ver oferta' }
}
