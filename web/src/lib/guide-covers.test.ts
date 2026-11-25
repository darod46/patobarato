import { readdirSync } from 'node:fs'
import { join } from 'node:path'
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
  it('lists exactly the covers present in public/guias', () => {
    const onDisk = readdirSync(join(__dirname, '../../public/guias'))
      .filter((f) => f.endsWith('.jpeg'))
      .map((f) => f.slice(0, -'.jpeg'.length))
      .sort()
    expect([...GUIDE_COVER_SLUGS].sort()).toEqual(onDisk)
  })
})
