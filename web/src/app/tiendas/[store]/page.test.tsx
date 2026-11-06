import { describe, expect, it, vi } from 'vitest'
import StorePage, { generateMetadata } from './page'

vi.mock('../../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../../lib/deals', () => ({
  fetchDeals: vi.fn(async () => ({ deals: [], hasMore: false })),
  fetchHashtags: vi.fn(async () => []),
}))
vi.mock('../../../lib/coupons', () => ({ fetchCoupons: vi.fn(async () => []) }))
vi.mock('../../../lib/stores-data', () => ({
  fetchStores: vi.fn(async () => [{ store: 'aliexpress', deals: 2, coupons: 0 }]),
}))

const params = (store: string) => ({ params: Promise.resolve({ store }) })

describe('StorePage', () => {
  it('404s for an unknown store, in the page and in the metadata', async () => {
    const page = await StorePage(params('fnac')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('fnac')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('is noindex with fewer than 3 deals and titled after the store', async () => {
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.title).toBe('Chollos de AliExpress · PatoBarato')
    expect(meta.robots).toEqual({ index: false, follow: true })
  })
})
