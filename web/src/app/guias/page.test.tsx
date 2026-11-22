import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchGuides } from '../../lib/guides-data'
import { fetchPageCopy } from '../../lib/page-copy'
import { fetchStores } from '../../lib/stores-data'
import type { GuideSummary } from '../../lib/types'
import GuidesPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/guides-data', () => ({ fetchGuides: vi.fn() }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

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
  vi.mocked(fetchPageCopy).mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('is indexable with no guides and keeps the copy and the honest empty state', async () => {
    vi.mocked(fetchGuides).mockResolvedValue([])
    vi.mocked(fetchPageCopy).mockResolvedValue({
      kind: 'static',
      slug: 'guias',
      title: 'Guías de compra: comparativas',
      h1: 'Guías de compra del pato',
      introMd: 'Comparamos varios modelos de cada producto.',
      faq: [],
      updatedAt: '2026-11-20T10:00:00Z',
    })
    const meta = await generateMetadata()
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Guías de compra: comparativas · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/guias')
    render(await GuidesPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Guías de compra del pato' })).toBeInTheDocument()
    expect(screen.getByText('Comparamos varios modelos de cada producto.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay guías publicadas')).toBeInTheDocument()
  })

  it('uses the default h1 without copy and still renders when the stores read fails', async () => {
    vi.mocked(fetchGuides).mockResolvedValue([guide()])
    vi.mocked(fetchStores).mockImplementation(async () => { throw new Error('down') })
    render(await GuidesPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Guías de compra' })).toBeInTheDocument()
  })

  it('rejects (never an empty page) when the guides read fails', async () => {
    vi.mocked(fetchGuides).mockImplementation(async () => { throw new Error('down') })
    await expect(GuidesPage()).rejects.toThrow('down')
  })
})

describe('GuidesPage during the build', () => {
  afterEach(() => {
    delete process.env.NEXT_PHASE
  })

  it('renders the honest empty state when the guides cannot be read', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchGuides).mockRejectedValue(new TypeError('fetch failed'))
    vi.mocked(fetchStores).mockRejectedValue(new TypeError('fetch failed'))
    render(await GuidesPage())
    expect(screen.getByText('Todavía no hay guías publicadas')).toBeInTheDocument()
  })
})
