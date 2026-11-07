import { describe, expect, it } from 'vitest'
import { discountPercent, escapeIlike, formatLongDate, formatPrice, timeAgo } from './format'

describe('formatPrice', () => {
  it('uses es-ES separators with a non-breaking space before the euro sign', () => {
    expect(formatPrice(1299.9)).toBe('1.299,90 €')
    expect(formatPrice(9.99)).toBe('9,99 €')
    expect(formatPrice(1000)).toBe('1.000,00 €')
  })
})

describe('discountPercent', () => {
  it('computes the rounded percentage', () => {
    expect(discountPercent(29.99, 49.99)).toBe(40)
    expect(discountPercent(50, 100)).toBe(50)
  })
  it('returns null when there is no discount', () => {
    expect(discountPercent(10, 10)).toBeNull()
    expect(discountPercent(12, 10)).toBeNull()
  })
  it('rounds half up like the bot', () => {
    expect(discountPercent(87.5, 100)).toBe(13)
    expect(discountPercent(66.5, 100)).toBe(34)
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it('formats each range', () => {
    expect(timeAgo(ago(30_000), now)).toBe('ahora')
    expect(timeAgo(ago(5 * 60_000), now)).toBe('hace 5 min')
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('hace 3 h')
    expect(timeAgo(ago(24 * 3_600_000), now)).toBe('hace 1 día')
    expect(timeAgo(ago(48 * 3_600_000), now)).toBe('hace 2 días')
  })
})

describe('escapeIlike', () => {
  it('replaces PostgREST * wildcards with a single-char wildcard', () => {
    expect(escapeIlike('a*b')).toBe('a_b')
  })

  it('escapes wildcard characters and backslashes', () => {
    expect(escapeIlike('50% a_b\\c')).toBe('50\\% a\\_b\\\\c')
  })
})

describe('formatLongDate', () => {
  it('formats a Spanish long date in Madrid time', () => {
    expect(formatLongDate('2026-11-07T12:00:00Z')).toBe('7 de noviembre de 2026')
    expect(formatLongDate('2026-12-31T23:30:00Z')).toBe('1 de enero de 2027')
  })
})
