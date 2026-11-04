import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
})

type Result = { deals: Deal[]; hasMore: boolean }
function deferred() {
  let resolve!: (r: Result) => void
  const promise = new Promise<Result>((res) => (resolve = res))
  return { promise, resolve }
}
const ids = (deals: Deal[]) => deals.map((d) => d.publicationId)

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
    expect(fetcher).toHaveBeenCalledWith({ q: undefined, tag: undefined, page: 0 })
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
})
