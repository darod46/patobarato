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
