// Amazon Associates reviews the web before approving the account, and only the web is registered there.
// Until approval the web shows no Amazon prices (they may only come from Amazon's API) and nothing about
// the Telegram channel. Once approved: set both to true (the tests already cover that mode).
export const FLAGS = {
  /** Amazon prices, previous prices, discounts and "Mínimo histórico" on the web. */
  amazonPrices: false,
  /** Every link to and mention of the Telegram channel on the web. */
  telegram: false,
}

/** Whether the web may show prices for a store's products. */
export function pricesVisible(store: string): boolean {
  return FLAGS.amazonPrices || store !== 'amazon'
}
