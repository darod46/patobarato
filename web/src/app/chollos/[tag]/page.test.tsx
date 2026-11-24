import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as deals from '../../../lib/deals'
import * as eventsData from '../../../lib/events-data'
import * as pageCopy from '../../../lib/page-copy'
import type { Deal, PageCopy } from '../../../lib/types'
import { HashtagClient } from '../../../components/HashtagClient'
import { PageFaq, PageIntro } from '../../../components/PageIntro'
import { payloadKeys, propsOf } from '../../../test-utils/clientProps'
import HashtagPage, { generateMetadata } from './page'

vi.mock('../../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))
vi.mock('../../../lib/deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/deals')>()),
  fetchDeals: vi.fn(),
  fetchHashtagCount: vi.fn(),
  fetchHashtags: vi.fn(),
}))

const deal = (id: number): Deal => ({
  publicationId: id, status: 'active', endedAt: null,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: ['tecnologia'],
  affiliateUrl: 'https://amzn.to/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `B00000000${id}`,
  country: 'es',
  store: 'amazon',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
  priceBeforeCoupon: false,
})

const copy: PageCopy = {
  kind: 'category', slug: 'tecnologia', title: 'Chollos de tecnología hoy', h1: 'Chollos de tecnología',
  introMd: 'Hoy hay {deals} chollos de tecnología. Los revisamos a mano.', faq: [], updatedAt: '2026-11-01T00:00:00Z',
}

const props = (tag = 'tecnologia') => ({ params: Promise.resolve({ tag }) })

function given({ n, count, withCopy }: { n: number; count?: number | null | Error; withCopy: boolean }) {
  vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: Array.from({ length: n }, (_, i) => deal(i + 1)), hasMore: false })
  if (count instanceof Error) vi.mocked(deals.fetchHashtagCount).mockRejectedValue(count)
  else vi.mocked(deals.fetchHashtagCount).mockResolvedValue(count === undefined ? n : count)
  vi.mocked(pageCopy.fetchPageCopy).mockResolvedValue(withCopy ? copy : null)
}

describe('/chollos/[tag]', () => {
  beforeEach(() => {
    vi.mocked(deals.fetchHashtags).mockResolvedValue([])
    vi.mocked(eventsData.fetchEvents).mockResolvedValue([])
  })

  it('is indexable with copy even with a single deal', async () => {
    given({ n: 1, withCopy: true })
    const meta = await generateMetadata(props())
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Chollos de tecnología hoy · PatoBarato')
    expect(meta.description).toBe('Hoy hay 1 chollo de tecnología.')
    expect(meta.alternates?.canonical).toBe('/chollos/tecnologia')
    expect(pageCopy.fetchPageCopy).toHaveBeenCalledWith({}, 'category', 'tecnologia')
  })

  it('is noindex without copy and with 2 deals', async () => {
    given({ n: 2, withCopy: false })
    expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true })
  })

  it('is indexable without copy and with 3 deals', async () => {
    given({ n: 3, withCopy: false })
    const meta = await generateMetadata(props())
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Chollos de tecnologia: 3 ofertas hoy · PatoBarato')
  })

  it('uses the live count over the loaded page size', async () => {
    given({ n: 2, count: 40, withCopy: false })
    expect((await generateMetadata(props())).robots).toBeUndefined()
  })

  it('falls back to the loaded deals when the count read fails (never noindex for that)', async () => {
    given({ n: 3, count: new Error('down'), withCopy: false })
    const meta = await generateMetadata(props())
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Chollos de tecnologia: 3 ofertas hoy · PatoBarato')
  })

  it('treats a failed copy read as no copy', async () => {
    given({ n: 3, withCopy: false })
    vi.mocked(pageCopy.fetchPageCopy).mockRejectedValue(new Error('down'))
    expect((await generateMetadata(props())).robots).toBeUndefined()
    render(await HashtagPage(props()))
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de tecnologia' })).toBeInTheDocument()
  })

  it('stays indexable with 2 deals when the copy read fails (the DB did not answer)', async () => {
    given({ n: 2, withCopy: false })
    vi.mocked(pageCopy.fetchPageCopy).mockRejectedValue(new Error('down'))
    expect((await generateMetadata(props())).robots).toBeUndefined()
  })

  it('is still noindex with 2 deals when the copy row is absent', async () => {
    given({ n: 2, withCopy: false })
    vi.mocked(pageCopy.fetchPageCopy).mockResolvedValue(null)
    expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true })
  })

  it('rejects (no 404, no noindex) when the deals read fails', async () => {
    given({ n: 3, withCopy: true })
    vi.mocked(deals.fetchDeals).mockRejectedValue(new Error('down'))
    await expect(generateMetadata(props())).rejects.toThrow('down')
    await expect(HashtagPage(props())).rejects.toThrow('down')
  })

  it('is a 404 when the tag has no active deals', async () => {
    given({ n: 0, withCopy: true })
    for (const run of [() => generateMetadata(props()), () => HashtagPage(props())]) {
      const error = await run().catch((e: unknown) => e)
      expect((error as { digest?: string }).digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/)
    }
  })

  it('renders the copy h1, the intro with the live count and the deals', async () => {
    given({ n: 2, count: 12, withCopy: true })
    const { container } = render(await HashtagPage(props()))
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de tecnología' })).toBeInTheDocument()
    expect(screen.getByText(/Hoy hay 12 chollos de tecnología\./)).toBeInTheDocument()
    expect(screen.getByText('Chollo 1')).toBeInTheDocument()
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(ld.itemListElement[1].item).toMatch(/\/chollos\/tecnologia$/)
  })

  it('hands the intro and FAQ to the client as server-rendered slots, never the raw copy', async () => {
    given({ n: 3, withCopy: true })
    vi.mocked(pageCopy.fetchPageCopy).mockResolvedValue({ ...copy, faq: [{ q: '¿Cada cuánto?', aMd: 'Cada hora.' }] })
    const client = propsOf(await HashtagPage(props()), HashtagClient)
    expect((client.intro as { type: unknown }).type).toBe(PageIntro)
    expect((client.faq as { type: unknown }).type).toBe(PageFaq)
    const keys = payloadKeys(client)
    for (const key of ['introMd', 'aMd', 'copy']) expect(keys.has(key)).toBe(false)
  })

  it('renders the page even when the events read fails', async () => {
    given({ n: 3, withCopy: false })
    vi.mocked(eventsData.fetchEvents).mockRejectedValue(new Error('down'))
    render(await HashtagPage(props()))
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
