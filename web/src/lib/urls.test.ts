import { describe, expect, it } from 'vitest'
import { SITE_URL, parseProductSlug, productPath, slugify, tagPath } from './urls'
import { storeInfo } from './stores'

describe('slugify', () => {
  it('lowercases and strips symbols', () => {
    expect(slugify('Cecotec Accesorios Freidora de aire ✨')).toBe('cecotec-accesorios-freidora-de-aire')
  })
  it('strips accents and punctuation', () => {
    expect(slugify('Niños: ¡Pañales Dodot T2, 88 uds!')).toBe('ninos-panales-dodot-t2-88-uds')
  })
  it('caps at 8 words', () => {
    expect(slugify('one two three four five six seven eight nine ten')).toBe('one-two-three-four-five-six-seven-eight')
  })
  it('falls back to oferta when empty', () => {
    expect(slugify('✨✨')).toBe('oferta')
  })
})

describe('productPath / parseProductSlug / tagPath', () => {
  it('builds the canonical product path', () => {
    expect(
      productPath({ store: 'amazon', asin: 'B0BPZVJJQJ', title: 'Cecotec Accesorios Freidora de aire' }),
    ).toBe('/oferta/amazon/cecotec-accesorios-freidora-de-aire-b0bpzvjjqj')
  })
  it('parses slug and id', () => {
    expect(parseProductSlug('cecotec-x-b0bpzvjjqj')).toEqual({ slug: 'cecotec-x', id: 'b0bpzvjjqj' })
    expect(parseProductSlug('b0bpzvjjqj')).toEqual({ slug: '', id: 'b0bpzvjjqj' })
    expect(parseProductSlug('foo')).toBeNull()
  })
  it('encodes tags', () => {
    expect(tagPath('niños')).toBe('/chollos/ni%C3%B1os')
  })
  it('exposes the site url', () => {
    expect(SITE_URL).toBe('https://www.patobarato.com')
  })
})

describe('storeInfo', () => {
  it('knows amazon and falls back otherwise', () => {
    expect(storeInfo('amazon')).toEqual({ name: 'Amazon España', short: 'Amazon', cta: 'Ver en Amazon' })
    expect(storeInfo('pccomp')).toEqual({ name: 'pccomp', short: 'pccomp', cta: 'Ver oferta' })
  })
})
