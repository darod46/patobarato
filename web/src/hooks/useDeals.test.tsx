import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DealSort } from '../lib/deals'
import type { Deal } from '../lib/types'
import { useDeals } from './useDeals'

const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 1,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  affiliateUrl: 'https://amzn.to/x',
  title: `Deal ${id}`,
  imageUrl: null,
  asin: `A${id}`,
  country: 'es',
  store: 'amazon',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
})

type Result = { deals: Deal[]; hasMore: boolean }
function deferred() {
  let resolve!: (r: Result) => void
  const promise = new Promise<Result>((res) => (resolve = res))
  return { promise, resolve }
}
const ids = (deals: Deal[]) => deals.map((d) => d.publicationId)

describe('useDeals store filter', () => {
  it('passes the store to the fetcher and refetches when it changes', async () => {
    const fetcher = vi.fn(async () => ({ deals: [deal(1)], hasMore: false }))
    const { rerender } = renderHook(
      ({ store }: { store: string | null }) => useDeals(fetcher, { q: '', tag: null, store }),
      { initialProps: { store: 'aliexpress' as string | null } },
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenLastCalledWith({ q: undefined, tag: undefined, store: 'aliexpress', sort: 'recientes', page: 0 })
    rerender({ store: null })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith({ q: undefined, tag: undefined, store: undefined, sort: 'recientes', page: 0 })
  })
})

describe('useDeals', () => {
  it('loads the first page and appends the next on loadMore', async () => {
    const fetcher = vi.fn(async (p: { page: number }) => ({
      deals: [deal(p.page + 1)],
      hasMore: p.page === 0,
    }))
    const { result } = renderHook(() => useDeals(fetcher, { q: '', tag: null }))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ids(result.current.deals)).toEqual([1])
    expect(result.current.hasMore).toBe(true)
    expect(fetcher).toHaveBeenCalledWith({ q: undefined, tag: undefined, sort: 'recientes', page: 0 })
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.deals)).toEqual([1, 2]))
    expect(result.current.hasMore).toBe(false)
    expect(result.current.loadingMore).toBe(false)
  })

  it('ignores superseded responses', async () => {
    const a = deferred()
    const b = deferred()
    const fetcher = vi.fn((p: { q?: string }) => (p.q === 'a' ? a.promise : b.promise))
    const { result, rerender } = renderHook(({ q }) => useDeals(fetcher, { q, tag: null }), {
      initialProps: { q: 'a' },
    })
    rerender({ q: 'b' })
    await act(async () => b.resolve({ deals: [deal(2)], hasMore: false }))
    await act(async () => a.resolve({ deals: [deal(1)], hasMore: true }))
    expect(ids(result.current.deals)).toEqual([2])
    expect(result.current.hasMore).toBe(false)
  })

  it('does not append a stale loadMore after filters change', async () => {
    const more = deferred()
    const fetcher = vi.fn((p: { q?: string; page: number }) => {
      if (p.q === 'a' && p.page === 1) return more.promise
      return Promise.resolve({ deals: [deal(p.q === 'a' ? 1 : 3)], hasMore: p.q === 'a' })
    })
    const { result, rerender } = renderHook(({ q }) => useDeals(fetcher, { q, tag: null }), {
      initialProps: { q: 'a' },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.loadMore())
    rerender({ q: 'b' })
    await waitFor(() => expect(ids(result.current.deals)).toEqual([3]))
    await act(async () => more.resolve({ deals: [deal(2)], hasMore: false }))
    expect(ids(result.current.deals)).toEqual([3])
    expect(result.current.loadingMore).toBe(false)
  })

  it('skips deals already present when loading more', async () => {
    const fetcher = vi.fn(async (p: { page: number }) =>
      p.page === 0
        ? { deals: [deal(1), deal(2)], hasMore: true }
        : { deals: [deal(2), deal(3)], hasMore: false },
    )
    const { result } = renderHook(() => useDeals(fetcher, { q: '', tag: null }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.deals)).toEqual([1, 2, 3]))
  })

  it('reports error and retries', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ deals: [deal(1)], hasMore: false })
    const { result } = renderHook(() => useDeals(fetcher, { q: '', tag: null }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.deals).toHaveLength(1)
  })

  it('starts ready with initial data, skips page 0 and loads page 1 on loadMore', async () => {
    const fetcher = vi.fn(async (p: { page: number }) => ({ deals: [deal(p.page + 10)], hasMore: false }))
    const { result } = renderHook(() =>
      useDeals(fetcher, { q: '', tag: null }, { q: '', tag: null, deals: [deal(1)], hasMore: true }),
    )
    expect(result.current.status).toBe('ready')
    expect(ids(result.current.deals)).toEqual([1])
    expect(result.current.hasMore).toBe(true)
    await act(async () => {})
    expect(fetcher).not.toHaveBeenCalled()
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.deals)).toEqual([1, 11]))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith({ q: undefined, tag: undefined, sort: 'recientes', page: 1 })
  })

  it('fetches fresh when filters differ from the initial data, also when they come back', async () => {
    const fetcher = vi.fn(async (p: { q?: string }) => ({
      deals: [deal(p.q ? 2 : 3)],
      hasMore: false,
    }))
    const { result, rerender } = renderHook(
      ({ q }) =>
        useDeals(fetcher, { q, tag: null }, { q: '', tag: null, deals: [deal(1)], hasMore: true }),
      { initialProps: { q: '' } },
    )
    rerender({ q: 'lego' })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(ids(result.current.deals)).toEqual([2]))
    expect(fetcher).toHaveBeenLastCalledWith({ q: 'lego', tag: undefined, sort: 'recientes', page: 0 })
    rerender({ q: '' })
    await waitFor(() => expect(ids(result.current.deals)).toEqual([3]))
    expect(fetcher).toHaveBeenLastCalledWith({ q: undefined, tag: undefined, sort: 'recientes', page: 0 })
  })

  it('applies initial data to the fixed filters it was fetched with', async () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() =>
      useDeals(fetcher, { q: '', tag: 'hogar' }, { q: '', tag: 'hogar', deals: [deal(5)], hasMore: false }),
    )
    await act(async () => {})
    expect(ids(result.current.deals)).toEqual([5])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ignores initial data fetched for other filters', async () => {
    const fetcher = vi.fn().mockResolvedValue({ deals: [deal(2)], hasMore: false })
    const { result } = renderHook(() =>
      useDeals(fetcher, { q: '', tag: 'sony' }, { q: '', tag: null, deals: [deal(1)], hasMore: true }),
    )
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(ids(result.current.deals)).toEqual([2]))
    expect(fetcher).toHaveBeenCalledWith({ q: undefined, tag: 'sony', sort: 'recientes', page: 0 })
  })
})

describe('useDeals sort', () => {
  it('passes sort to the fetcher and refetches page 0 when it changes', async () => {
    const fetcher = vi.fn(async () => ({ deals: [deal(1)], hasMore: false }))
    const { result, rerender } = renderHook(
      ({ sort }) => useDeals(fetcher, { q: '', tag: null, sort }),
      { initialProps: { sort: 'recientes' as DealSort } },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fetcher).toHaveBeenLastCalledWith({ q: undefined, tag: undefined, sort: 'recientes', page: 0 })
    rerender({ sort: 'descuento' })
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith({ q: undefined, tag: undefined, sort: 'descuento', page: 0 }))
  })
})
