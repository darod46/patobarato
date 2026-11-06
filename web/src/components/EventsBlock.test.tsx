import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SiteEvent } from '../content/events'
import { EventsBlock } from './EventsBlock'

const now = new Date('2026-11-06T10:00:00Z')
const e1: SiteEvent = { id: 'a', name: '11.11 AliExpress', date: '2026-11-11', stores: ['aliexpress'] }
const e2: SiteEvent = { id: 'b', name: 'Black Friday', date: '2026-11-27', stores: ['amazon', 'pccomponentes'] }
const e3: SiteEvent = { id: 'c', name: 'Prime Day', date: '2027-07-01', stores: ['amazon'], approximate: true }

describe('EventsBlock', () => {
  it('shows the next event with the days left and the upcoming list with stores', () => {
    render(<EventsBlock next={e1} upcoming={[e1, e2, e3]} now={now} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('11.11 AliExpress')
    expect(screen.getByText('Faltan 5 días')).toBeInTheDocument()
    expect(screen.getByText('27 nov')).toBeInTheDocument()
    expect(screen.getByText('julio')).toBeInTheDocument()
    expect(screen.getByText('Amazon, PcComponentes')).toBeInTheDocument()
  })

  it('says it is today and renders only the list without a next event', () => {
    const { unmount } = render(<EventsBlock next={{ ...e1, date: '2026-11-06' }} upcoming={[e1]} now={now} />)
    expect(screen.getByText('Es hoy')).toBeInTheDocument()
    unmount()
    render(<EventsBlock next={null} upcoming={[e2]} now={now} />)
    expect(screen.queryByText(/Faltan/)).toBeNull()
    expect(screen.getByText('Black Friday')).toBeInTheDocument()
  })
})

describe('EventsBlock approximate dates', () => {
  it('never counts days to an approximate date', () => {
    render(<EventsBlock next={e3} upcoming={[e3]} now={now} />)
    expect(screen.queryByText(/Faltan/)).toBeNull()
    expect(screen.getByText('En julio')).toBeInTheDocument()
  })
})
