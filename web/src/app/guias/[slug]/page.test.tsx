import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { item, offer } from '../../../components/guides/test-fixtures'
import { fetchGuide } from '../../../lib/guides-data'
import { getSupabase } from '../../../lib/supabase'
import { fetchStores } from '../../../lib/stores-data'
import type { Guide } from '../../../lib/types'
import GuidePage, { generateMetadata } from './page'

vi.mock('../../../lib/supabase', () => ({ getSupabase: vi.fn(() => ({})) }))
vi.mock('../../../lib/guides-data', () => ({ fetchGuide: vi.fn() }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

const recent = () => new Date(Date.now() - 3_600_000).toISOString()

const guide = (over: Partial<Guide> = {}): Guide => ({
  slug: 'mejores-freidoras',
  title: 'Mejores freidoras de aire',
  subtitle: 'Las que merecen la pena',
  category: 'Cocina',
  author: 'Ana',
  readingMinutes: 6,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-07T12:00:00Z',
  pricesCheckedAt: recent(),
  introMd: 'Introducción.',
  howToChooseMd: 'Elige.',
  faq: [{ q: '¿Cuánto?', aMd: 'Poco.' }],
  items: [item(1, { stores: [offer({ checkedAt: recent() })] })],
  ...over,
})

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

beforeEach(() => {
  vi.mocked(fetchGuide).mockReset()
  vi.mocked(getSupabase).mockReset().mockReturnValue({} as never)
  vi.mocked(fetchStores).mockReset().mockResolvedValue([])
})

describe('GuidePage', () => {
  it('404s for an unknown slug, in the page and in the metadata', async () => {
    vi.mocked(fetchGuide).mockResolvedValue(null)
    const page = await GuidePage(params('nada')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('nada')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('renders a guide with stale prices as noindex, labelled and never hidden', async () => {
    const stale = guide({ pricesCheckedAt: '2026-10-01T00:00:00Z' })
    vi.mocked(fetchGuide).mockResolvedValue(stale)
    render(await GuidePage(params(stale.slug)))
    expect(screen.getByRole('heading', { level: 1, name: stale.title })).toBeInTheDocument()
    expect(screen.getByText(/Precios de hace \d+ días/)).toBeInTheDocument()
    expect((await generateMetadata(params(stale.slug))).robots).toEqual({ index: false, follow: true })
  })

  it('shows Precios no disponibles when no price was ever checked', async () => {
    const g = guide({ pricesCheckedAt: null })
    vi.mocked(fetchGuide).mockResolvedValue(g)
    render(await GuidePage(params(g.slug)))
    expect(screen.getByText('Precios no disponibles')).toBeInTheDocument()
  })

  it('is indexable with fresh prices and emits Article and FAQPage JSON-LD', async () => {
    vi.mocked(fetchGuide).mockResolvedValue(guide())
    expect((await generateMetadata(params('mejores-freidoras'))).robots).toBeUndefined()
    const { container } = render(await GuidePage(params('mejores-freidoras')))
    const types = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? '')
    const all = types.join('\n')
    expect(all).toContain('"Article"')
    expect(all).toContain('"FAQPage"')
    expect(all).toContain('"ItemList"')
    expect(all).toContain('"BreadcrumbList"')
  })

  it('omits FAQPage JSON-LD when there are no questions', async () => {
    vi.mocked(fetchGuide).mockResolvedValue(guide({ faq: [] }))
    const { container } = render(await GuidePage(params('mejores-freidoras')))
    const all = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('\n')
    expect(all).toContain('"Article"')
    expect(all).not.toContain('FAQPage')
  })

  it.each([
    ['fetchGuide rejects', () => vi.mocked(fetchGuide).mockImplementation(async () => { throw new Error('down') })],
    ['getSupabase throws', () => vi.mocked(getSupabase).mockImplementation(() => { throw new Error('no env') })],
  ])('responds 404 when %s', async (_n, setup) => {
    setup()
    const page = await GuidePage(params('x')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('x')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('still renders when the stores for the footer fail to load', async () => {
    vi.mocked(fetchGuide).mockResolvedValue(guide())
    vi.mocked(fetchStores).mockImplementation(async () => {
      throw new Error('down')
    })
    render(await GuidePage(params('mejores-freidoras')))
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
