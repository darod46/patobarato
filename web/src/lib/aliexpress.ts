import 'server-only'
import { createHmac } from 'node:crypto'
import type { CatalogProduct } from './catalog'
import { numOrNull } from './coupons'
import { discountPercent } from './format'

const ENDPOINT = 'https://api-sg.aliexpress.com/sync'
const METHOD = 'aliexpress.affiliate.product.query'
const RESPONSE_KEY = 'aliexpress_affiliate_product_query_response'

export type AliCredentials = {
  appKey: string
  appSecret: string
  trackingId: string
}

export class AliExpressError extends Error {
  readonly code: string
  readonly msg: string
  constructor(code: string, msg: string) {
    super(`AliExpress error ${code}: ${msg}`)
    this.code = code
    this.msg = msg
    this.name = 'AliExpressError'
  }
}

/** HMAC-SHA256 (key = secret) over key+value pairs sorted by key, uppercase hex; `sign` is excluded. */
export function signParams(params: Record<string, string>, secret: string): string {
  const message = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  return createHmac('sha256', secret).update(message).digest('hex').toUpperCase()
}

type RawProduct = Record<string, unknown>

function price(v: unknown): number | null {
  if (v === '' || (typeof v !== 'string' && typeof v !== 'number' && v !== null && v !== undefined))
    return null
  const n = numOrNull(v as string | number | null | undefined)
  return n !== null && Number.isFinite(n) && n > 0 ? n : null
}

function discountFromString(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim().replace(/%$/, '').trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const pct = Math.trunc(n)
  return pct >= 1 && pct <= 99 ? pct : null
}

function toProduct(raw: RawProduct): CatalogProduct | null {
  const sale = price(raw.target_sale_price)
  if (sale === null || raw.product_id == null) return null
  const original = price(raw.target_original_price)
  const originalPrice = original !== null && original > sale ? original : null
  // Never fall back to product_detail_url: a result without an affiliate link is not shown.
  const link = raw.promotion_link
  if (typeof link !== 'string' || link === '') return null
  const image = raw.product_main_image_url
  return {
    origin: 'aliexpress',
    store: 'aliexpress',
    externalId: String(raw.product_id),
    title: typeof raw.product_title === 'string' ? raw.product_title : '',
    price: sale,
    originalPrice,
    discountPct:
      originalPrice === null
        ? null
        : (discountFromString(raw.discount) ?? discountPercent(sale, originalPrice)),
    currency: 'EUR',
    imageUrl: typeof image === 'string' && image !== '' ? image : null,
    affiliateUrl: link,
  }
}

export async function searchAliExpress(
  q: string,
  creds: AliCredentials,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<CatalogProduct[]> {
  const params: Record<string, string> = {
    app_key: creds.appKey,
    timestamp: String(now()),
    sign_method: 'sha256',
    method: METHOD,
    v: '2.0',
    format: 'json',
    keywords: q,
    ship_to_country: 'ES',
    target_currency: 'EUR',
    target_language: 'ES',
    page_size: '12',
    page_no: '1',
    sort: 'LAST_VOLUME_DESC',
    tracking_id: creds.trackingId,
  }
  params.sign = signParams(params, creds.appSecret)
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  if (!res.ok) throw new AliExpressError(String(res.status), 'HTTP error')
  const body = (await res.json()) as Record<string, unknown>
  const error = body.error_response as { code?: unknown; msg?: unknown } | undefined
  if (error) throw new AliExpressError(String(error.code ?? ''), String(error.msg ?? ''))
  const payload = body[RESPONSE_KEY] as
    | {
        resp_result?: {
          resp_code?: unknown
          resp_msg?: unknown
          result?: { products?: { product?: RawProduct[] } }
        }
      }
    | undefined
  const resp = payload?.resp_result
  if (resp && String(resp.resp_code) !== '200') {
    throw new AliExpressError(String(resp.resp_code), String(resp.resp_msg ?? ''))
  }
  const items = resp?.result?.products?.product ?? []
  return items.map(toProduct).filter((p): p is CatalogProduct => p !== null)
}
