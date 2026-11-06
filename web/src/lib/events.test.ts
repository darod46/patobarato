import { describe, expect, it } from 'vitest'
import { EVENTS, type SiteEvent } from '../content/events'
import { daysUntil, eventDateLabel, nextEvent, upcomingEvents } from './events'

const now = new Date('2026-11-06T10:00:00Z')

describe('events', () => {
  it('nextEvent is the first future event', () => {
    expect(nextEvent(now)?.id).toBe('aliexpress-1111')
  })

  it('daysUntil counts calendar days', () => {
    expect(daysUntil(EVENTS[0], now)).toBe(5)
  })

  it('today counts as 0 and yesterday is skipped', () => {
    const e: SiteEvent[] = [
      { id: 'a', name: 'A', date: '2026-11-05', stores: [] },
      { id: 'b', name: 'B', date: '2026-11-06', stores: [] },
    ]
    expect(nextEvent(now, e)?.id).toBe('b')
    expect(daysUntil(e[1], now)).toBe(0)
  })

  it('counts days in Europe/Madrid, not UTC', () => {
    // 23:30 UTC on the 5th is already the 6th in Madrid, so the 6th is "today".
    const lateUtc = new Date('2026-11-05T23:30:00Z')
    expect(daysUntil({ id: 'x', name: 'X', date: '2026-11-06', stores: [] }, lateUtc)).toBe(0)
  })

  it('upcomingEvents limits and skips past', () => {
    expect(upcomingEvents(now, 2).map((e) => e.id)).toEqual(['aliexpress-1111', 'black-friday'])
  })

  it('labels dates in Spanish and approximate dates by month', () => {
    expect(eventDateLabel(EVENTS[0])).toBe('11 nov')
    expect(eventDateLabel(EVENTS[4])).toBe('julio')
  })

  it('returns null with no future event', () => {
    expect(nextEvent(new Date('2030-01-01T00:00:00Z'), EVENTS)).toBeNull()
    expect(upcomingEvents(new Date('2030-01-01T00:00:00Z'), 4, EVENTS)).toEqual([])
  })
})

describe('events: window and approximate dates', () => {
  const jan = new Date('2027-01-08T10:00:00Z')
  it('nextEvent ignores events beyond the window', () => {
    expect(nextEvent(jan, EVENTS, 45)).toBeNull()
    expect(nextEvent(now, EVENTS, 45)?.id).toBe('aliexpress-1111')
  })
  it('upcomingEvents still lists approximate events', () => {
    expect(upcomingEvents(jan, 4).map((e) => e.id)).toEqual(['prime-day'])
  })
})
