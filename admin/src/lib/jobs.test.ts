import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, calls: 0, inserted: null as unknown }))

vi.mock('./supabase/browser', () => ({
  createBrowserSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            state.calls += 1
            return { data: state.row, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { enqueueJob, useJob } from './jobs'

beforeEach(() => {
  vi.useFakeTimers()
  state.calls = 0
})
afterEach(() => vi.useRealTimers())

describe('enqueueJob', () => {
  it('inserts the job and returns its id', async () => {
    const client = {
      from: (table: string) => ({
        insert: (row: unknown) => {
          state.inserted = { table, row }
          return { select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }) }
        },
      }),
    }
    const id = await enqueueJob(client as never, 'revalidate', { paths: ['/'] })
    expect(id).toBe(42)
    expect(state.inserted).toEqual({ table: 'admin_jobs', row: { type: 'revalidate', payload: { paths: ['/'] } } })
  })

  it('throws when the insert fails', async () => {
    const client = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'nope' } }) }) }) }),
    }
    await expect(enqueueJob(client as never, 'revalidate', {})).rejects.toThrow('nope')
  })
})

describe('useJob', () => {
  it('does nothing without a job id', async () => {
    const { result } = renderHook(() => useJob(null))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(result.current.status).toBeNull()
    expect(state.calls).toBe(0)
  })

  it('polls every 2 s until done, then stops', async () => {
    state.row = { status: 'pending', error: null, result: null, created_at: new Date().toISOString() }
    const { result } = renderHook(() => useJob(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.status).toBe('pending')
    state.row = { ...state.row, status: 'done', result: { ok: 1 } }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.status).toBe('done')
    expect(result.current.result).toEqual({ ok: 1 })
    const calls = state.calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(state.calls).toBe(calls)
  })

  it('reports the error of a failed job', async () => {
    state.row = { status: 'error', error: 'boom', result: null, created_at: new Date().toISOString() }
    const { result } = renderHook(() => useJob(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current).toMatchObject({ status: 'error', error: 'boom', stuck: false })
  })

  it('marks stuck after 60s pending', async () => {
    state.row = { status: 'pending', error: null, result: null, created_at: new Date().toISOString() }
    const { result } = renderHook(() => useJob(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(result.current.stuck).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32000)
    })
    expect(result.current.stuck).toBe(true)
  })

  it('stops polling on unmount', async () => {
    state.row = { status: 'running', error: null, result: null, created_at: new Date().toISOString() }
    const { unmount } = renderHook(() => useJob(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    unmount()
    const calls = state.calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(state.calls).toBe(calls)
  })
})
