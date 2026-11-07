import { parseDealSort, type DealSort } from './deals'

export type ListingFilters = { tag: string | null; store: string | null; sort: DealSort }

/** Normalizes a raw `tag` value; anything that is not a hashtag is no filter. */
export function parseTagFilter(raw: string | null | undefined): string | null {
  const tag = (raw ?? '').toLowerCase()
  return /^[\p{L}\p{N}_]+$/u.test(tag) ? tag : null
}

/** Normalizes a raw `tienda` value; anything that is not a store id is no filter. */
export function parseStoreFilter(raw: string | null | undefined): string | null {
  const store = (raw ?? '').toLowerCase()
  return /^[a-z0-9_]+$/.test(store) ? store : null
}

/** The listing filters of a query string, shared by the client hook and the `/chollos` server page. */
export function parseListingFilters(get: (key: string) => string | null | undefined): ListingFilters {
  return {
    tag: parseTagFilter(get('tag')),
    store: parseStoreFilter(get('tienda')),
    sort: parseDealSort(get('orden')),
  }
}
