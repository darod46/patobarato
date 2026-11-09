import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases, strips accents and separates with dashes', () => {
    expect(slugify('Freidoras de aire: guía 2026')).toBe('freidoras-de-aire-guia-2026')
    expect(slugify('  ¡Año Nuevo!  ')).toBe('ano-nuevo')
    expect(slugify('Ratón -- Pro__X')).toMatch(/^[a-z0-9-]+$/)
  })
})
