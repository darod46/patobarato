import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { siteEvent } from '../test-utils/siteEvent'
import { AnnouncementBar } from './AnnouncementBar'

const now = new Date('2026-11-06T10:00:00Z')
const event = siteEvent({ id: 1, slug: 'aliexpress-1111', name: '11.11 de AliExpress', startsOn: '2026-11-11', stores: ['aliexpress'] })
const second = siteEvent({ id: 2, slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', stores: ['amazon'] })

describe('AnnouncementBar', () => {
  it('announces the next event and the latest deal', () => {
    render(<AnnouncementBar event={event} second={second} latestPublishedAt="2026-11-06T09:48:00Z" now={now} />)
    expect(
      screen.getByText('11.11 de AliExpress en 5 días · Black Friday el 27 de noviembre · Última oferta publicada hace 12 min'),
    ).toBeInTheDocument()
  })

  it('links the whole text to the event page', () => {
    render(<AnnouncementBar event={second} latestPublishedAt={null} now={now} />)
    const link = screen.getByRole('link', { name: 'Black Friday en 21 días' })
    expect(link).toHaveAttribute('href', '/eventos/black-friday')
    expect(link.className).toContain('min-h-11')
  })

  it('says hoy for an event today', () => {
    render(<AnnouncementBar event={{ ...event, startsOn: '2026-11-06', endsOn: '2026-11-06' }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress es hoy')).toBeInTheDocument()
  })

  it('renders nothing without an event', () => {
    const { container } = render(<AnnouncementBar event={null} latestPublishedAt="2026-11-06T09:48:00Z" now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AnnouncementBar approximate dates', () => {
  it('names the month instead of counting days', () => {
    render(<AnnouncementBar event={{ ...event, startsOn: '2027-07-01', endsOn: '2027-07-01', approximate: true }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress en julio')).toBeInTheDocument()
  })
})

describe('AnnouncementBar second event', () => {
  it('omits an approximate second event', () => {
    render(<AnnouncementBar event={event} second={{ ...second, startsOn: '2027-07-01', endsOn: '2027-07-01', approximate: true }} latestPublishedAt={null} now={now} />)
    expect(screen.getByText('11.11 de AliExpress en 5 días')).toBeInTheDocument()
  })
})

describe('AnnouncementBar during an event', () => {
  it('says the event is on, never a negative count', () => {
    render(<AnnouncementBar event={second} latestPublishedAt={null} now={new Date('2026-11-28T12:00:00Z')} />)
    expect(screen.getByText('Black Friday está en marcha')).toBeInTheDocument()
  })
  it('says hoy on the day of a one-day event', () => {
    render(<AnnouncementBar event={event} latestPublishedAt={null} now={new Date('2026-11-11T12:00:00Z')} />)
    expect(screen.getByText('11.11 de AliExpress es hoy')).toBeInTheDocument()
  })
})
