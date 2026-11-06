import { describe, expect, it } from 'vitest'
import { STORES, storeFromSlug, storeInfo } from './stores'

describe('stores', () => {
  it('every known store has a slug equal to its id', () => {
    for (const [id, info] of Object.entries(STORES)) expect(info.slug).toBe(id)
  })
  it('storeFromSlug resolves known slugs and rejects unknown ones', () => {
    expect(storeFromSlug('aliexpress')).toBe('aliexpress')
    expect(storeFromSlug('pccomponentes')).toBe('pccomponentes')
    expect(storeFromSlug('nope')).toBeNull()
    expect(storeFromSlug('')).toBeNull()
    expect(storeFromSlug('constructor')).toBeNull()
  })
  it('unknown stores fall back to their id', () => {
    expect(storeInfo('pccomp')).toEqual({ slug: 'pccomp', name: 'pccomp', short: 'pccomp', cta: 'Ver oferta' })
  })
})
