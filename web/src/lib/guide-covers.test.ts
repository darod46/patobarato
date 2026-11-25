import { describe, expect, it } from 'vitest'
import { GUIDE_COVER_SLUGS, guideCover } from './guide-covers'

describe('guideCover', () => {
  it('returns the cover of a guide that has one, with its size and alt', () => {
    expect(guideCover('freidoras-de-aire-menos-100', 'Freidoras de aire por menos de 100 €')).toEqual({
      url: '/guias/freidoras-de-aire-menos-100.jpeg',
      width: 1376,
      height: 768,
      alt: 'El pato de PatoBarato con el producto de la guía: Freidoras de aire por menos de 100 €',
    })
  })
  it('returns null for a guide without cover', () => {
    expect(guideCover('guia-sin-portada', 'Lo que sea')).toBeNull()
  })
  it('lists the 24 calendar guides', () => {
    expect(GUIDE_COVER_SLUGS.size).toBe(24)
  })
})
