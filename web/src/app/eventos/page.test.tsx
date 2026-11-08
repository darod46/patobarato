import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEvents } from '../../lib/events-data'
import { fetchStores } from '../../lib/stores-data'
import { siteEvent } from '../../test-utils/siteEvent'
import EventsPage from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))
  vi.mocked(fetchEvents).mockReset()
  vi.mocked(fetchStores).mockReset()
  vi.mocked(fetchStores).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('EventsPage', () => {
  it('groups events into running, upcoming and past sections, past newest first', async () => {
    vi.mocked(fetchEvents).mockResolvedValue([
      siteEvent({ slug: 'singles', name: 'Singles', startsOn: '2026-11-09', endsOn: '2026-11-12' }),
      siteEvent({ slug: 'bf', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' }),
      siteEvent({ slug: 'prime-oct', name: 'Prime Octubre', startsOn: '2026-10-07' }),
      siteEvent({ slug: 'prime-jul', name: 'Prime Julio', startsOn: '2026-07-15' }),
    ])
    render(await EventsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos de compras' })).toBeInTheDocument()
    const section = (name: string) => within(screen.getByRole('heading', { level: 2, name }).closest('section')!)
    expect(section('En marcha').getByRole('link', { name: /Singles/ })).toHaveAttribute('href', '/eventos/singles')
    expect(section('Próximos').getByRole('link', { name: /Black Friday/ })).toBeInTheDocument()
    const past = section('Pasados').getAllByRole('link')
    expect(past.map((l) => l.textContent)).toEqual(['Prime Octubre', 'Prime Julio'])
  })

  it('omits empty sections', async () => {
    vi.mocked(fetchEvents).mockResolvedValue([siteEvent({ slug: 'bf', name: 'Black Friday', startsOn: '2026-11-27' })])
    render(await EventsPage())
    expect(screen.getByRole('heading', { level: 2, name: 'Próximos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'En marcha' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Pasados' })).not.toBeInTheDocument()
  })

  it('shows an empty state when the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchEvents).mockImplementation(async () => { throw new Error('down') })
    render(await EventsPage())
    expect(screen.getByText('Ahora mismo no podemos cargar el calendario. Vuelve en un rato.')).toBeInTheDocument()
  })
})
