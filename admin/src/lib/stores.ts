// Display names copied from web/src/lib/stores.ts (`short`): the same names the Telegram link label uses.
const STORE_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  aliexpress: 'AliExpress',
  pccomponentes: 'PcComponentes',
  mediamarkt: 'MediaMarkt',
  elcorteingles: 'El Corte Inglés',
  decathlon: 'Decathlon',
}

/** Display name of a store id; unknown ids are shown as they are. */
export function storeName(id: string): string {
  return STORE_NAMES[id] ?? id
}

/** Ids of the known stores, for pickers. */
export const STORE_IDS: string[] = Object.keys(STORE_NAMES)
