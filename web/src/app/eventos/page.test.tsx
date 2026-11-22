import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEvents } from '../../lib/events-data'
import { fetchPageCopy } from '../../lib/page-copy'
import { fetchStores } from '../../lib/stores-data'
import { siteEvent } from '../../test-utils/siteEvent'
import EventsPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))
  vi.mocked(fetchEvents).mockReset()
  vi.mocked(fetchStores).mockReset()
  vi.mocked(fetchStores).mockResolvedValue([])
  vi.mocked(fetchPageCopy).mockReset().mockResolvedValue(null)
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
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos de compras: Black Friday, 11.11, Cyber Monday' })).toBeInTheDocument()
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

  it('is indexable with no events and keeps the copy and an honest empty state', async () => {
    vi.mocked(fetchEvents).mockResolvedValue([])
    vi.mocked(fetchPageCopy).mockResolvedValue({
      kind: 'static',
      slug: 'eventos',
      title: 'Eventos de compras: Black Friday, 11.11 y Cyber Monday',
      h1: 'Eventos de compras',
      introMd: 'Algunas fechas concentran las mejores ofertas del año.',
      faq: [],
      updatedAt: '2026-11-20T10:00:00Z',
    })
    const meta = await generateMetadata()
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Eventos de compras: Black Friday, 11.11 y Cyber Monday · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/eventos')
    render(await EventsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos de compras' })).toBeInTheDocument()
    expect(screen.getByText('Algunas fechas concentran las mejores ofertas del año.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay eventos en el calendario.')).toBeInTheDocument()
  })

  it('rejects (never an empty page) when the events read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchEvents).mockImplementation(async () => { throw new Error('down') })
    await expect(EventsPage()).rejects.toThrow('down')
  })

  it('still renders when the copy and stores reads fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchEvents).mockResolvedValue([siteEvent({ slug: 'bf', name: 'Black Friday', startsOn: '2026-11-27' })])
    vi.mocked(fetchPageCopy).mockImplementation(async () => { throw new Error('down') })
    vi.mocked(fetchStores).mockImplementation(async () => { throw new Error('down') })
    render(await EventsPage())
    expect(screen.getByRole('heading', { level: 2, name: 'Próximos' })).toBeInTheDocument()
    expect((await generateMetadata()).robots).toBeUndefined()
  })
})

describe('EventsPage during the build', () => {
  afterEach(() => {
    delete process.env.NEXT_PHASE
  })

  it('renders the honest empty state when the events cannot be read', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchEvents).mockRejectedValue(new TypeError('fetch failed'))
    render(await EventsPage())
    expect(screen.getByText('Todavía no hay eventos en el calendario.')).toBeInTheDocument()
  })
})
