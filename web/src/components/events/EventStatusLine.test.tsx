import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { siteEvent } from '../../test-utils/siteEvent'
import { EventStatusLine } from './EventStatusLine'

const now = new Date('2026-11-08T10:00:00Z')
const bf = siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })

describe('EventStatusLine', () => {
  it('before: start date and countdown', () => {
    render(<EventStatusLine event={bf} next={null} now={now} />)
    expect(screen.getByText('Empieza el 27 de noviembre (en 19 días)')).toBeInTheDocument()
  })

  it('before with approximate dates: the month only', () => {
    const prime = siteEvent({ slug: 'prime-day', name: 'Prime Day', startsOn: '2027-07-01', approximate: true })
    render(<EventStatusLine event={prime} next={null} now={now} />)
    expect(screen.getByText('Previsto para julio')).toBeInTheDocument()
  })

  it('during a multi-day event: until its last day', () => {
    render(<EventStatusLine event={bf} next={null} now={new Date('2026-11-28T10:00:00Z')} />)
    expect(screen.getByText('En marcha hasta el 29 de noviembre')).toBeInTheDocument()
  })

  it('during a one-day event: es hoy', () => {
    const singles = siteEvent({ slug: 'aliexpress-1111', name: '11.11', startsOn: '2026-11-11' })
    render(<EventStatusLine event={singles} next={null} now={new Date('2026-11-11T10:00:00Z')} />)
    expect(screen.getByText('Es hoy')).toBeInTheDocument()
  })

  it('after, with a next event: links to it', () => {
    const cyber = siteEvent({ slug: 'cyber-monday', name: 'Cyber Monday', startsOn: '2026-11-30' })
    const { container } = render(<EventStatusLine event={bf} next={cyber} now={new Date('2026-11-30T10:00:00Z')} />)
    expect(container).toHaveTextContent('Terminó el 29 de noviembre. El próximo evento es Cyber Monday.')
    expect(screen.getByRole('link', { name: 'Cyber Monday' })).toHaveAttribute('href', '/eventos/cyber-monday')
  })

  it('after, without a next event: comes back next year', () => {
    const { container } = render(<EventStatusLine event={bf} next={null} now={new Date('2026-12-05T10:00:00Z')} />)
    expect(container).toHaveTextContent('Terminó el 29 de noviembre. Volverá en 2027.')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
