import { describe, expect, it } from 'vitest'
import { siteEvent as ev } from '../test-utils/siteEvent'
import {
  activeEvent,
  daysUntil,
  eventDateLabel,
  eventLongDateLabel,
  eventPath,
  eventPhase,
  eventRangeLabel,
  eventYear,
  madridDay,
  madridDayBounds,
  nextEvent,
  upcomingEvents,
  whenLabel,
} from './events'

const now = new Date('2026-11-06T10:00:00Z')
const ali = ev({ id: 1, slug: 'aliexpress-1111', name: '11.11 de AliExpress', startsOn: '2026-11-11', stores: ['aliexpress'] })
const bf = ev({ id: 2, slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })
const cyber = ev({ id: 3, slug: 'cyber-monday', name: 'Cyber Monday', startsOn: '2026-11-30' })
const rebajas = ev({ id: 4, slug: 'rebajas-enero', name: 'Rebajas de enero', startsOn: '2027-01-07', endsOn: '2027-02-28' })
const prime = ev({ id: 5, slug: 'prime-day', name: 'Prime Day', startsOn: '2027-07-01', endsOn: '2027-07-02', approximate: true })
const EVENTS = [prime, rebajas, cyber, bf, ali]

describe('events', () => {
  it('nextEvent is the first future event', () => {
    expect(nextEvent(now, EVENTS)?.slug).toBe('aliexpress-1111')
  })

  it('daysUntil counts calendar days to the start', () => {
    expect(daysUntil(ali, now)).toBe(5)
    expect(daysUntil(bf, now)).toBe(21)
  })

  it('today counts as 0 and an event that ended yesterday is skipped', () => {
    const a = ev({ id: 1, slug: 'a', name: 'A', startsOn: '2026-11-05' })
    const b = ev({ id: 2, slug: 'b', name: 'B', startsOn: '2026-11-06' })
    expect(nextEvent(now, [a, b])?.slug).toBe('b')
    expect(daysUntil(b, now)).toBe(0)
  })

  it('counts days in Europe/Madrid, not UTC', () => {
    // 23:30 UTC on the 5th is already the 6th in Madrid, so the 6th is "today".
    const lateUtc = new Date('2026-11-05T23:30:00Z')
    expect(daysUntil(ev({ slug: 'x', name: 'X', startsOn: '2026-11-06' }), lateUtc)).toBe(0)
  })

  it('upcomingEvents limits, sorts by start and skips past', () => {
    expect(upcomingEvents(now, 2, EVENTS).map((e) => e.slug)).toEqual(['aliexpress-1111', 'black-friday'])
  })

  it('keeps an event upcoming until its last day', () => {
    const lastDay = new Date('2026-11-29T12:00:00Z')
    expect(upcomingEvents(lastDay, 2, EVENTS).map((e) => e.slug)).toEqual(['black-friday', 'cyber-monday'])
    expect(nextEvent(lastDay, EVENTS, 45)?.slug).toBe('black-friday')
    const dayAfter = new Date('2026-11-30T12:00:00Z')
    expect(upcomingEvents(dayAfter, 1, EVENTS).map((e) => e.slug)).toEqual(['cyber-monday'])
  })

  it('writes the long date for the announcement bar, of the start or the end', () => {
    expect(eventLongDateLabel(bf)).toBe('27 de noviembre')
    expect(eventLongDateLabel(bf, 'end')).toBe('29 de noviembre')
    expect(eventLongDateLabel(rebajas)).toBe('7 de enero')
    expect(eventLongDateLabel(prime)).toBe('julio')
  })

  it('labels dates in Spanish and approximate dates by month', () => {
    expect(eventDateLabel(ali)).toBe('11 nov')
    expect(eventDateLabel(prime)).toBe('julio')
  })

  it('whenLabel counts to the start or names the month', () => {
    expect(whenLabel(ali, now)).toBe('en 5 días')
    expect(whenLabel(prime, now)).toBe('en julio')
  })

  it('whenLabel never counts negative days during an event', () => {
    expect(whenLabel(bf, new Date('2026-11-27T12:00:00Z'))).toBe('está en marcha')
    expect(whenLabel(bf, new Date('2026-11-28T12:00:00Z'))).toBe('está en marcha')
    expect(whenLabel(ali, new Date('2026-11-11T12:00:00Z'))).toBe('es hoy')
  })

  it('returns null with no future event', () => {
    expect(nextEvent(new Date('2030-01-01T00:00:00Z'), EVENTS)).toBeNull()
    expect(upcomingEvents(new Date('2030-01-01T00:00:00Z'), 4, EVENTS)).toEqual([])
  })
})

describe('events: window and approximate dates', () => {
  const lateFeb = new Date('2027-03-08T10:00:00Z')
  it('nextEvent ignores events beyond the window', () => {
    expect(nextEvent(lateFeb, EVENTS, 45)).toBeNull()
    expect(nextEvent(now, EVENTS, 45)?.slug).toBe('aliexpress-1111')
  })
  it('upcomingEvents still lists approximate events', () => {
    expect(upcomingEvents(lateFeb, 4, EVENTS).map((e) => e.slug)).toEqual(['prime-day'])
  })
})

describe('eventPhase', () => {
  it('is during from the first to the last day in Madrid', () => {
    expect(eventPhase(bf, new Date('2026-11-26T23:30:00Z'))).toBe('during') // 00:30 on the 27th in Madrid
    expect(eventPhase(bf, new Date('2026-11-29T22:59:00Z'))).toBe('during') // 23:59 on the 29th
    expect(eventPhase(bf, new Date('2026-11-29T23:00:00Z'))).toBe('after')
    expect(eventPhase(bf, new Date('2026-11-20T12:00:00Z'))).toBe('before')
    expect(eventPhase(bf, new Date('2026-11-26T22:59:00Z'))).toBe('before') // 23:59 on the 26th
  })
})

describe('activeEvent', () => {
  it('picks the latest-started event in progress', () => {
    const at = new Date('2026-11-28T12:00:00Z')
    const week = ev({ id: 9, slug: 'black-week', name: 'Black Week', startsOn: '2026-11-23', endsOn: '2026-11-30' })
    expect(activeEvent(at, [week, bf, cyber])?.slug).toBe('black-friday')
    expect(activeEvent(at, [bf, week])?.slug).toBe('black-friday')
  })
  it('is null when nothing is in progress', () => {
    expect(activeEvent(now, EVENTS)).toBeNull()
    expect(activeEvent(now, [])).toBeNull()
  })
  it('approximate event never becomes the active event', () => {
    const approx = ev({ slug: 'approx', name: 'Approx', startsOn: '2026-11-01', endsOn: '2026-11-30', approximate: true })
    expect(activeEvent(new Date('2026-11-15T12:00:00Z'), [approx])).toBeNull()
  })
})

describe('event helpers', () => {
  it('labels ranges', () => {
    expect(eventRangeLabel(bf)).toBe('27 – 29 de noviembre')
    expect(eventRangeLabel(ev({ slug: 'one', name: 'One', startsOn: '2026-11-11' }))).toBe('11 de noviembre')
    expect(eventRangeLabel(prime)).toBe('julio')
    expect(eventRangeLabel(rebajas)).toBe('7 de enero – 28 de febrero')
  })
  it('eventPath and eventYear', () => {
    expect(eventPath('black-friday')).toBe('/eventos/black-friday')
    expect(eventYear(bf)).toBe(2026)
    expect(eventYear(rebajas)).toBe(2027)
  })
})

describe('madridDay', () => {
  it('returns the Madrid calendar day, optionally shifted', () => {
    const t = new Date('2026-11-08T23:30:00Z')
    expect(madridDay(t)).toBe('2026-11-09')
    expect(madridDay(t, -7)).toBe('2026-11-02')
  })
})

describe('madridDayBounds', () => {
  it('madridDayBounds handles CET and CEST', () => {
    expect(madridDayBounds('2026-11-27', '2026-11-29')).toEqual({
      start: '2026-11-26T23:00:00.000Z',
      end: '2026-11-29T22:59:59.000Z',
    })
    expect(madridDayBounds('2027-07-01', '2027-07-01').start).toBe('2027-06-30T22:00:00.000Z')
  })
  it('handles the DST change days', () => {
    expect(madridDayBounds('2027-03-28', '2027-03-28')).toEqual({
      start: '2027-03-27T23:00:00.000Z',
      end: '2027-03-28T21:59:59.000Z',
    })
  })
})
