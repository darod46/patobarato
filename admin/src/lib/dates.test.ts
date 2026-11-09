import { describe, expect, it } from 'vitest'
import { isoToMadridLocal, madridLocalToIso } from './dates'

describe('madrid dates', () => {
  it('converts winter local time (UTC+1) to ISO', () => {
    expect(madridLocalToIso('2026-01-15T10:30')).toBe('2026-01-15T09:30:00.000Z')
  })
  it('converts summer local time (UTC+2) to ISO', () => {
    expect(madridLocalToIso('2026-07-15T10:30')).toBe('2026-07-15T08:30:00.000Z')
  })
  it('handles the day of the DST change', () => {
    expect(madridLocalToIso('2026-03-29T12:00')).toBe('2026-03-29T10:00:00.000Z')
    expect(madridLocalToIso('2026-10-25T12:00')).toBe('2026-10-25T11:00:00.000Z')
  })
  it('converts ISO to Madrid local input value', () => {
    expect(isoToMadridLocal('2026-01-15T09:30:00Z')).toBe('2026-01-15T10:30')
    expect(isoToMadridLocal('2026-07-15T22:30:00Z')).toBe('2026-07-16T00:30')
  })
  it('round-trips', () => {
    const iso = '2026-11-09T18:45:00.000Z'
    expect(madridLocalToIso(isoToMadridLocal(iso))).toBe(iso)
  })
  it('returns null for empty or invalid input', () => {
    expect(madridLocalToIso('')).toBeNull()
    expect(madridLocalToIso('nope')).toBeNull()
    expect(isoToMadridLocal(null)).toBe('')
  })
})
