import { describe, expect, it } from 'vitest'
import { joinNames } from './text'

describe('joinNames', () => {
  it('joins one, two and three names in Spanish', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A y B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B y C')
  })
})
