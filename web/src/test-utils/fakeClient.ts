import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

export type FakeResult = { data: unknown; error: { message: string } | null }

/** A chainable stand-in for the Supabase query builder that records every call and resolves to `result`. */
export function fakeClient(result: FakeResult) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'order', 'range', 'ilike', 'contains', 'limit', 'eq', 'neq', 'or', 'gte', 'lte']) {
    builder[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, args])
      return builder
    })
  }
  builder.then = (resolve: (r: FakeResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return builder
  })
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push(['rpc', [name, args]])
    return builder
  })
  return { client: { from, rpc } as unknown as SupabaseClient, calls }
}
