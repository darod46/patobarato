import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SiteEvent } from '../content/events'
import { AnnouncementBar } from './AnnouncementBar'

const now = new Date('2026-11-06T10:00:00Z')
const event: SiteEvent = { id: 'aliexpress-1111', name: '11.11 de AliExpress', date: '2026-11-11', stores: ['aliexpress'] }
const second: SiteEvent = { id: 'black-friday', name: 'Black Friday', date: '2026-11-27', stores: ['amazon'] }

describe('AnnouncementBar', () => {
  it('announces the next event and the latest deal', () => {
    render(<AnnouncementBar event={event} second={second} latestPublishedAt="2026-11-06T09:48:00Z" now={now} />)
    expect(
      screen.getByText('11.11 de AliExpress en 5 días · Black Friday el 27 de noviembre · Última oferta publicada hace 12 min'),
    ).toBeInTheDocument()
  })

  it('says hoy for an event today', () => {
    render(<AnnouncementBar event={{ ...event, date: '2026-11-06' }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress es hoy')).toBeInTheDocument()
  })

  it('renders nothing without an event', () => {
    const { container } = render(<AnnouncementBar event={null} latestPublishedAt="2026-11-06T09:48:00Z" now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AnnouncementBar approximate dates', () => {
  it('names the month instead of counting days', () => {
    render(<AnnouncementBar event={{ ...event, date: '2027-07-01', approximate: true }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress en julio')).toBeInTheDocument()
  })
})

describe('AnnouncementBar second event', () => {
  it('omits an approximate second event', () => {
    render(<AnnouncementBar event={event} second={{ ...second, date: '2027-07-01', approximate: true }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress en 5 días')).toBeInTheDocument()
  })
})
