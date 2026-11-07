import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../lib/catalog'
import { product } from '../components/search/fixtures'
import { useCatalogSearch } from './useCatalogSearch'

type Deferred = { promise: Promise<CatalogProduct[]>; resolve: (v: CatalogProduct[]) => void; reject: (e: unknown) => void }
function deferred(): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<CatalogProduct[]>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useCatalogSearch', () => {
  it('is idle below minLength without calling the fetcher', () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() => useCatalogSearch('a', fetcher))
    expect(result.current).toEqual({ status: 'idle', products: [] })
    act(() => void vi.advanceTimersByTime(1000))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('debounces 300 ms, then loads and resolves', async () => {
    const d = deferred()
    const fetcher = vi.fn(() => d.promise)
    const { result } = renderHook(() => useCatalogSearch('raton', fetcher))
    act(() => void vi.advanceTimersByTime(299))
    expect(fetcher).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toEqual(['raton', expect.any(AbortSignal)])
    expect(result.current.status).toBe('loading')
    await act(async () => d.resolve([product()]))
    expect(result.current.status).toBe('ready')
    expect(result.current.products).toHaveLength(1)
  })

  it('aborts the previous request on a new q and ignores its late result', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const fetcher = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
    const { result, rerender } = renderHook(({ q }) => useCatalogSearch(q, fetcher), { initialProps: { q: 'uno' } })
    act(() => void vi.advanceTimersByTime(300))
    const firstSignal = fetcher.mock.calls[0][1] as AbortSignal
    rerender({ q: 'dos' })
    expect(firstSignal.aborted).toBe(true)
    act(() => void vi.advanceTimersByTime(300))
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => d2.resolve([product({ title: 'nuevo' })]))
    await act(async () => d1.resolve([product({ title: 'viejo' })]))
    expect(result.current.products.map((p) => p.title)).toEqual(['nuevo'])
  })

  it('ignores an old rejection too', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const fetcher = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
    const { result, rerender } = renderHook(({ q }) => useCatalogSearch(q, fetcher), { initialProps: { q: 'uno' } })
    act(() => void vi.advanceTimersByTime(300))
    rerender({ q: 'dos' })
    act(() => void vi.advanceTimersByTime(300))
    await act(async () => d2.resolve([product()]))
    await act(async () => d1.reject(new Error('boom')))
    expect(result.current.status).toBe('ready')
  })

  it('going under minLength resets to idle and aborts the pending request', async () => {
    const d = deferred()
    const fetcher = vi.fn(() => d.promise)
    const { result, rerender } = renderHook(({ q }) => useCatalogSearch(q, fetcher), { initialProps: { q: 'raton' } })
    act(() => void vi.advanceTimersByTime(300))
    const signal = (fetcher.mock.calls[0] as unknown[])[1] as AbortSignal
    rerender({ q: 'r' })
    expect(signal.aborted).toBe(true)
    expect(result.current).toEqual({ status: 'idle', products: [] })
    await act(async () => d.resolve([product()]))
    expect(result.current.status).toBe('idle')
  })

  it('maps a fetcher failure to error but ignores AbortError', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCatalogSearch('raton', fetcher))
    await act(async () => void vi.advanceTimersByTime(300))
    expect(result.current).toEqual({ status: 'error', products: [] })

    const abortErr = new DOMException('aborted', 'AbortError')
    const f2 = vi.fn().mockRejectedValueOnce(abortErr)
    const r2 = renderHook(() => useCatalogSearch('raton', f2))
    await act(async () => void vi.advanceTimersByTime(300))
    expect(r2.result.current.status).toBe('loading')
  })
})
