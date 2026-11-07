import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { siteEvent } from '../test-utils/siteEvent'
import { EventsBlock } from './EventsBlock'

const now = new Date('2026-11-06T10:00:00Z')
const e1 = siteEvent({ id: 1, slug: 'aliexpress-1111', name: '11.11 de AliExpress', startsOn: '2026-11-11', stores: ['aliexpress'] })
const e2 = siteEvent({ id: 2, slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', stores: ['amazon', 'pccomponentes'] })
const e3 = siteEvent({ id: 3, slug: 'prime-day', name: 'Prime Day', startsOn: '2027-07-01', stores: ['amazon'], approximate: true })

describe('EventsBlock', () => {
  it('shows the next event with the days left and the upcoming list with stores', () => {
    render(<EventsBlock next={e1} upcoming={[e1, e2, e3]} now={now} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('11.11 de AliExpress')
    expect(screen.getByText('Faltan 5 días')).toBeInTheDocument()
    expect(screen.getByText('27 nov')).toBeInTheDocument()
    expect(screen.getByText('julio')).toBeInTheDocument()
    expect(screen.getByText('Amazon, PcComponentes')).toBeInTheDocument()
  })

  it('links each event name to its page', () => {
    render(<EventsBlock next={e2} upcoming={[e2]} now={now} />)
    const links = screen.getAllByRole('link', { name: 'Black Friday' })
    expect(links.length).toBe(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/eventos/black-friday')
  })

  it('says it is today and renders only the list without a next event', () => {
    const { unmount } = render(<EventsBlock next={{ ...e1, startsOn: '2026-11-06', endsOn: '2026-11-06' }} upcoming={[e1]} now={now} />)
    expect(screen.getByText('Es hoy')).toBeInTheDocument()
    unmount()
    render(<EventsBlock next={null} upcoming={[e2]} now={now} />)
    expect(screen.queryByText(/Faltan/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Black Friday' })).toHaveAttribute('href', '/eventos/black-friday')
  })
})

describe('EventsBlock approximate dates', () => {
  it('never counts days to an approximate date', () => {
    render(<EventsBlock next={e3} upcoming={[e3]} now={now} />)
    expect(screen.queryByText(/Faltan/)).toBeNull()
    expect(screen.getByText('En julio')).toBeInTheDocument()
  })
})

describe('EventsBlock during an event', () => {
  it('says until when a multi-day event runs, never a negative count', () => {
    render(<EventsBlock next={e2} upcoming={[e2]} now={new Date('2026-11-28T12:00:00Z')} />)
    expect(screen.getByText('En marcha hasta el 29 de noviembre')).toBeInTheDocument()
    expect(screen.queryByText(/Faltan/)).toBeNull()
  })
  it('says it is today on the day of a one-day event', () => {
    render(<EventsBlock next={e1} upcoming={[e1]} now={new Date('2026-11-11T12:00:00Z')} />)
    expect(screen.getByText('Es hoy')).toBeInTheDocument()
  })
})
