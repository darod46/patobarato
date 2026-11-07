import { describe, expect, it } from 'vitest'
import { parseListingFilters, parseStoreFilter, parseTagFilter } from './filters'

describe('listing filters', () => {
  it('lowercases tags and rejects malformed ones', () => {
    expect(parseTagFilter('LEGO')).toBe('lego')
    expect(parseTagFilter('niños')).toBe('niños')
    expect(parseTagFilter('a}')).toBeNull()
    expect(parseTagFilter(undefined)).toBeNull()
  })

  it('lowercases stores and rejects malformed ones', () => {
    expect(parseStoreFilter('AliExpress')).toBe('aliexpress')
    expect(parseStoreFilter('a b')).toBeNull()
    expect(parseStoreFilter('')).toBeNull()
  })

  it('reads the three params, with recientes as the default order', () => {
    const params = new URLSearchParams('tag=Sony&tienda=amazon&orden=minimo')
    expect(parseListingFilters((k) => params.get(k))).toEqual({ tag: 'sony', store: 'amazon', sort: 'minimo' })
    expect(parseListingFilters(() => null)).toEqual({ tag: null, store: null, sort: 'recientes' })
  })
})
