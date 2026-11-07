import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchGuides } from '../../lib/guides-data'
import { fetchStores } from '../../lib/stores-data'
import type { GuideSummary } from '../../lib/types'
import GuidesPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/guides-data', () => ({ fetchGuides: vi.fn() }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

const guide = (over: Partial<GuideSummary> = {}): GuideSummary => ({
  slug: 'mejores-freidoras',
  title: 'Mejores freidoras de aire',
  subtitle: 'Las que merecen la pena',
  category: 'Cocina',
  author: 'Ana',
  readingMinutes: 6,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-07T12:00:00Z',
  items: 5,
  pricesCheckedAt: '2026-11-07T06:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.mocked(fetchGuides).mockReset()
  vi.mocked(fetchStores).mockReset()
  vi.mocked(fetchStores).mockResolvedValue([])
})

describe('GuidesPage', () => {
  it('renders one card per guide with product count and update date', async () => {
    vi.mocked(fetchGuides).mockResolvedValue([guide(), guide({ slug: 'otra', title: 'Otra guía', items: 1 })])
    render(await GuidesPage())
    expect(screen.getByRole('link', { name: 'Mejores freidoras de aire' })).toHaveAttribute('href', '/guias/mejores-freidoras')
    expect(screen.getByText('5 productos · actualizada el 7 de noviembre de 2026')).toBeInTheDocument()
    expect(screen.getByText('1 producto · actualizada el 7 de noviembre de 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Las que merecen la pena')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Cocina')[0]).toBeInTheDocument()
  })

  it.each([
    ['empty', () => vi.mocked(fetchGuides).mockResolvedValue([])],
    ['failing', () => vi.mocked(fetchGuides).mockImplementation(async () => { throw new Error('down') })],
  ])('shows an honest empty state when the fetch is %s', async (_n, setup) => {
    setup()
    render(await GuidesPage())
    expect(screen.getByText('Todavía no hay guías publicadas')).toBeInTheDocument()
  })

  it('is noindex with zero guides and indexable otherwise', async () => {
    vi.mocked(fetchGuides).mockResolvedValue([])
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true })
    vi.mocked(fetchGuides).mockResolvedValue([guide()])
    expect((await generateMetadata()).robots).toBeUndefined()
  })
})
