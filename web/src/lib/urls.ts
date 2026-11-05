import type { Deal } from './types'

export const SITE_URL = 'https://www.patobarato.com'

const MAX_WORDS = 8

export function slugify(title: string): string {
  const words = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS)
  return words.length ? words.join('-') : 'oferta'
}

export function productPath(deal: Pick<Deal, 'store' | 'asin' | 'title'>): string {
  return `/oferta/${deal.store}/${slugify(deal.title)}-${deal.asin.toLowerCase()}`
}

export function parseProductSlug(param: string): { slug: string; id: string } | null {
  const i = param.lastIndexOf('-')
  const id = param.slice(i + 1)
  if (!/^[a-z0-9]{10}$/i.test(id)) return null
  return { slug: i < 0 ? '' : param.slice(0, i), id: id.toLowerCase() }
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
