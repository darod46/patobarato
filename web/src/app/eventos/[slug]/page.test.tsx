import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { product } from '../../../components/search/fixtures'
import { fetchCoupons } from '../../../lib/coupons'
import { fetchDeals } from '../../../lib/deals'
import { fetchEvent, fetchEventPromos, fetchEvents } from '../../../lib/events-data'
import { fetchStores } from '../../../lib/stores-data'
import type { Deal } from '../../../lib/types'
import { siteEvent } from '../../../test-utils/siteEvent'
import EventPage, { dynamicParams, generateMetadata, generateStaticParams, revalidate } from './page'

vi.mock('../../../lib/supabase', () => ({ getSupabase: vi.fn(() => ({})) }))
vi.mock('../../../lib/events-data', () => ({ fetchEvent: vi.fn(), fetchEvents: vi.fn(), fetchEventPromos: vi.fn() }))
vi.mock('../../../lib/deals', () => ({ fetchDeals: vi.fn(), fetchLatestDeal: vi.fn() }))
vi.mock('../../../lib/coupons', () => ({ fetchCoupons: vi.fn() }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

const bf = siteEvent({
  id: 7, slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', hashtags: ['blackfriday'],
  introMd: 'El Black Friday es el viernes de descuentos.', faq: [{ q: '¿Cuándo es?', aMd: 'El último viernes.' }],
})
const prime = siteEvent({ slug: 'prime-day', name: 'Prime Day', startsOn: '2027-07-01', approximate: true, introMd: 'Prime Day.' })
const cyber = siteEvent({ slug: 'cyber-monday', name: 'Cyber Monday', startsOn: '2026-11-30' })
const deal = (id: number): Deal => ({
  publicationId: id, publishedAt: '2026-11-07T09:00:00Z', price: 10, previousPrice: null, coupon: null, hashtags: [],
  affiliateUrl: 'https://amzn.to/x', title: `Chollo ${id}`, imageUrl: null, asin: `A${id}`, country: 'es', store: 'amazon',
  productId: id, discountPct: null, previousMinPrice: null, isLowest: false,
})

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const ldTypes = (container: HTMLElement) =>
  [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? '{}')['@type'])
const fail = async () => { throw new Error('down') }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T10:00:00Z'))
  vi.mocked(fetchEvent).mockReset().mockImplementation(async (_c, slug) => [bf, prime, cyber].find((e) => e.slug === slug) ?? null)
  vi.mocked(fetchEvents).mockReset().mockResolvedValue([bf, cyber, prime])
  vi.mocked(fetchEventPromos).mockReset().mockResolvedValue([])
  vi.mocked(fetchDeals).mockReset().mockResolvedValue({ deals: [], hasMore: false })
  vi.mocked(fetchCoupons).mockReset().mockResolvedValue([])
  vi.mocked(fetchStores).mockReset().mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('EventPage', () => {
  it('revalidates hourly and renders unknown slugs on demand', () => {
    expect(revalidate).toBe(3600)
    expect(dynamicParams).toBe(true)
  })

  it('prerenders every published event, and none when the events fail to load', async () => {
    expect(await generateStaticParams()).toEqual([{ slug: 'black-friday' }, { slug: 'cyber-monday' }, { slug: 'prime-day' }])
    vi.mocked(fetchEvents).mockImplementation(fail)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await generateStaticParams()).toEqual([])
    expect(err.mock.calls[0][0]).toMatch(/^events: /)
    err.mockRestore()
  })

  it('404s for an unknown slug, in the page and in the metadata', async () => {
    const page = await EventPage(params('nada')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('nada')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('builds the metadata from the event', async () => {
    expect((await generateMetadata(params('black-friday'))).title).toBe('Black Friday 2026: chollos, cupones y consejos | PatoBarato')
  })

  it('emits Breadcrumb, Event and FAQ JSON-LD for Black Friday and loads blocks for the event', async () => {
    vi.mocked(fetchDeals).mockResolvedValue({ deals: Array.from({ length: 20 }, (_, i) => deal(i + 1)), hasMore: true })
    const { container } = render(await EventPage(params('black-friday')))
    expect(ldTypes(container)).toEqual(['BreadcrumbList', 'Event', 'FAQPage'])
    expect(fetchDeals).toHaveBeenCalledWith(expect.anything(), {
      page: 0, event: { hashtags: ['blackfriday'], from: '2026-11-27', to: '2026-11-29' },
    })
    expect(fetchCoupons).toHaveBeenCalledWith(expect.anything(), undefined, undefined, 7)
    expect(fetchEventPromos).toHaveBeenCalledWith(expect.anything(), 'black-friday')
    expect(screen.getAllByText(/^Chollo \d+$/)).toHaveLength(12)
    expect(screen.getByRole('heading', { level: 2, name: 'Chollos relacionados' })).toBeInTheDocument()
    expect(fetchEvents).not.toHaveBeenCalled()
  })

  it('omits the Event JSON-LD when the dates are approximate', async () => {
    const { container } = render(await EventPage(params('prime-day')))
    expect(ldTypes(container)).toEqual(['BreadcrumbList'])
    expect(screen.getByText('Previsto para julio')).toBeInTheDocument()
  })

  it('renders the AliExpress promos from the event fixtures', async () => {
    vi.mocked(fetchEventPromos).mockResolvedValue([product({ origin: 'aliexpress', store: 'aliexpress', title: 'Auriculares BT' })])
    render(await EventPage(params('black-friday')))
    expect(screen.getByRole('heading', { level: 2, name: 'Selección de AliExpress para el Black Friday' })).toBeInTheDocument()
    expect(screen.getByText('Auriculares BT')).toBeInTheDocument()
  })

  it('still renders the editorial page when every block loader fails', async () => {
    vi.mocked(fetchDeals).mockImplementation(fail)
    vi.mocked(fetchCoupons).mockImplementation(fail)
    vi.mocked(fetchEventPromos).mockImplementation(fail)
    vi.mocked(fetchStores).mockImplementation(fail)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(await EventPage(params('black-friday')))
    err.mockRestore()
    expect(screen.getByRole('heading', { level: 1, name: 'Black Friday' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Preguntas frecuentes',
      'Recibe los chollos al momento en Telegram',
    ])
  })

  it('after the event, links to the next one (never to itself)', async () => {
    vi.setSystemTime(new Date('2026-11-30T10:00:00Z'))
    render(await EventPage(params('black-friday')))
    expect(fetchEvents).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Cyber Monday' })).toHaveAttribute('href', '/eventos/cyber-monday')
  })
})
