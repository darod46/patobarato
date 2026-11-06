import type { Deal } from './types'

export const SITE_URL = 'https://www.patobarato.com'

const MAX_WORDS = 8

export function slugify(title: string): string {
  const words = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS)
  return words.length ? words.join('-') : 'oferta'
}

/**
 * Amazon `/oferta/amazon/{slug}-{asin}` and AliExpress `/oferta/aliexpress/{slug}-{id}` carry a title slug;
 * every other store uses the deal's `asin` (already a readable id) as the whole path segment.
 */
export function productPath(deal: Pick<Deal, 'store' | 'asin' | 'title'>): string {
  if (deal.store === 'amazon') return `/oferta/amazon/${slugify(deal.title)}-${deal.asin.toLowerCase()}`
  if (deal.store === 'aliexpress') return `/oferta/aliexpress/${slugify(deal.title)}-${deal.asin}`
  return `/oferta/${deal.store}/${encodeURIComponent(deal.asin)}`
}

export function parseProductSlug(store: string, param: string): { slug: string; id: string } | null {
  if (store !== 'amazon' && store !== 'aliexpress') return param ? { slug: '', id: param } : null
  const i = param.lastIndexOf('-')
  const id = param.slice(i + 1)
  const slug = i < 0 ? '' : param.slice(0, i)
  if (store === 'amazon') {
    return /^[a-z0-9]{10}$/i.test(id) ? { slug, id: id.toLowerCase() } : null
  }
  return /^\d{8,20}$/.test(id) ? { slug, id } : null
}

export function tagPath(tag: string): string {
  return `/chollos/${encodeURIComponent(tag)}`
}

const TAG_RE = /^[a-z0-9_áéíóúñü]+$/u

/** Normalizes a raw tag (already decoded or still percent-encoded); null if it is not a valid hashtag. */
export function parseTagParam(raw: string): string | null {
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Malformed escapes keep the raw text, which then fails validation.
  }
  const tag = decoded.normalize('NFC').toLowerCase()
  return TAG_RE.test(tag) ? tag : null
}
