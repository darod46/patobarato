// Mirror of the bot's AMAZON_LINKS_TO_WEB (bot/src/patobarato/config.py): while Amazon Associates reviews
// the web, Amazon posts link to the deal page on the web. Set to false together with the bot setting.
export const AMAZON_LINKS_TO_WEB = true

export const SITE_URL = 'https://www.patobarato.com'

/** The deal page the bot links an Amazon post to (same as web/src/lib/urls.ts productPath), or null. */
export function webDealUrl(store: string, asin: string | null, slug: string | null): string | null {
  if (!AMAZON_LINKS_TO_WEB || store !== 'amazon' || !asin || !slug) return null
  return `${SITE_URL}/oferta/amazon/${slug}-${asin.toLowerCase()}`
}
