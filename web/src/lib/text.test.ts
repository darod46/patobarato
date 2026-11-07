import { describe, expect, it } from 'vitest'
import { joinNames, stripMarkdown } from './text'

describe('joinNames', () => {
  it('joins one, two and three names in Spanish', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A y B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B y C')
  })
})

describe('stripMarkdown', () => {
  it('removes formatting, keeping link text and image alt', () => {
    expect(stripMarkdown('## Hola **mundo** y _tú_ `x`\nVer [la guía](https://a.es) ![foto](u.png)')).toBe('Hola mundo y tú x Ver la guía foto')
  })
})
