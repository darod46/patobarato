import { describe, expect, it } from 'vitest'
import { fromLocalInput, guideStatusLabel, toLocalInput } from './guide-dates'

const NOW = new Date('2026-11-22T10:00:00.000Z')

describe('guideStatusLabel', () => {
  it('draft is Borrador, even with a date', () => {
    expect(guideStatusLabel('draft', null, NOW)).toBe('Borrador')
    expect(guideStatusLabel('draft', '2026-11-30T06:00:00.000Z', NOW)).toBe('Borrador')
  })
  it('published with a past or missing date is Publicada', () => {
    expect(guideStatusLabel('published', null, NOW)).toBe('Publicada')
    expect(guideStatusLabel('published', '2026-01-01T00:00:00.000Z', NOW)).toBe('Publicada')
  })
  it('published with a future date is Programada with the Madrid day and short month', () => {
    expect(guideStatusLabel('published', '2026-11-30T06:00:00.000Z', NOW)).toBe('Programada · 30 nov')
    expect(guideStatusLabel('published', '2027-04-05T05:00:00.000Z', NOW)).toBe('Programada · 5 abr')
  })
  it('uses the Madrid day near midnight', () => {
    expect(guideStatusLabel('published', '2026-12-31T23:30:00.000Z', NOW)).toBe('Programada · 1 ene')
  })
})

describe('toLocalInput', () => {
  it('null is empty', () => expect(toLocalInput(null)).toBe(''))
  it('converts CET', () => expect(toLocalInput('2026-11-30T06:00:00.000Z')).toBe('2026-11-30T07:00'))
  it('converts CEST', () => expect(toLocalInput('2027-04-05T05:00:00.000Z')).toBe('2027-04-05T07:00'))
})

describe('fromLocalInput', () => {
  it('empty is null', () => expect(fromLocalInput('')).toBeNull())
  it('CET', () => expect(fromLocalInput('2026-11-30T07:00')).toBe('2026-11-30T06:00:00.000Z'))
  it('CEST', () => expect(fromLocalInput('2027-04-05T07:00')).toBe('2027-04-05T05:00:00.000Z'))
  it('round-trips around the DST changes', () => {
    for (const v of ['2027-03-28T01:30', '2027-03-28T03:30', '2026-10-25T01:30', '2026-10-25T03:30', '2026-12-31T23:59']) {
      expect(toLocalInput(fromLocalInput(v))).toBe(v)
    }
  })
  it('invalid input is null', () => expect(fromLocalInput('nope')).toBeNull())
})
