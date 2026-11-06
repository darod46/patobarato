import { describe, expect, it } from 'vitest'
import { SITE_URL, parseProductSlug, parseTagParam, productPath, slugify, tagPath } from './urls'
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
    expect(parseProductSlug('amazon', 'cecotec-x-b0bpzvjjqj')).toEqual({ slug: 'cecotec-x', id: 'b0bpzvjjqj' })
    expect(parseProductSlug('amazon', 'auriculares-sony-b000000001')).toEqual({
      slug: 'auriculares-sony',
      id: 'b000000001',
    })
    expect(parseProductSlug('amazon', 'b0bpzvjjqj')).toEqual({ slug: '', id: 'b0bpzvjjqj' })
    expect(parseProductSlug('amazon', 'foo')).toBeNull()
    expect(parseProductSlug('amazon', 'x')).toBeNull()
    expect(parseProductSlug('amazon', 'b000000001')).toEqual({ slug: '', id: 'b000000001' })
  })
  it('builds AliExpress and Awin product paths', () => {
    expect(
      productPath({ store: 'aliexpress', asin: '1005006123456789', title: 'Smart TV Xiaomi 55"' }),
    ).toBe('/oferta/aliexpress/smart-tv-xiaomi-55-1005006123456789')
    expect(
      productPath({ store: 'pccomponentes', asin: 'ninja-af300-freidora-de-aire', title: 'Ninja AF300 Freidora' }),
    ).toBe('/oferta/pccomponentes/ninja-af300-freidora-de-aire')
  })
  it('parses AliExpress ids after the last dash', () => {
    expect(parseProductSlug('aliexpress', 'smart-tv-1005006123456789')).toEqual({
      slug: 'smart-tv',
      id: '1005006123456789',
    })
    expect(parseProductSlug('aliexpress', '1005006123456789')).toEqual({ slug: '', id: '1005006123456789' })
    expect(parseProductSlug('aliexpress', 'smart-tv-123')).toBeNull()
    expect(parseProductSlug('aliexpress', 'smart-tv-b000000001')).toBeNull()
  })
  it('takes the whole param as the id for Awin stores, keeping case', () => {
    expect(parseProductSlug('pccomponentes', 'ninja-af300-freidora-de-aire')).toEqual({
      slug: '',
      id: 'ninja-af300-freidora-de-aire',
    })
    expect(parseProductSlug('mediamarkt', 'Foo-Bar')).toEqual({ slug: '', id: 'Foo-Bar' })
    expect(parseProductSlug('pccomponentes', '')).toBeNull()
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
    expect(storeInfo('amazon')).toEqual({ slug: 'amazon', name: 'Amazon España', short: 'Amazon', cta: 'Ver en Amazon' })
    expect(storeInfo('pccomp')).toEqual({ slug: 'pccomp', name: 'pccomp', short: 'pccomp', cta: 'Ver oferta' })
  })
})

describe('parseTagParam', () => {
  it('accepts plain, encoded and decoded tags, lowercased', () => {
    expect(parseTagParam('hogar')).toBe('hogar')
    expect(parseTagParam('Hogar')).toBe('hogar')
    expect(parseTagParam('ni%C3%B1os')).toBe('niños')
    expect(parseTagParam('niños')).toBe('niños')
    expect(parseTagParam('cámara_4k')).toBe('cámara_4k')
  })

  it('round-trips with tagPath', () => {
    expect(parseTagParam(tagPath('niños').slice('/chollos/'.length))).toBe('niños')
  })

  it('rejects anything outside the hashtag alphabet', () => {
    for (const bad of ['zzzz-no', '', 'a b', 'a%20b', '%E0%A4%A', 'x.y', 'çà']) {
      expect(parseTagParam(bad)).toBeNull()
    }
  })
})
