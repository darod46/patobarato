import { describe, expect, it } from 'vitest'
import { metadata } from './layout'

describe('root layout metadata', () => {
  it('declares hreflang alternates and the geo region', () => {
    expect(metadata.alternates).toEqual({ canonical: '/', languages: { 'es-ES': '/', 'x-default': '/' } })
    expect(metadata.other).toEqual({ 'geo.region': 'ES' })
  })
})
