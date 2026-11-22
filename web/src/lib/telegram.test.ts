import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import {
  CATEGORY_TAGS,
  CTA_PLACEMENTS,
  TELEGRAM_URL,
  categoryLabel,
  fetchChannelRecent,
  fetchChannelStats,
  formatMembers,
  isCtaPlacement,
  messageUrl,
} from './telegram'

/** Like fakeClient, but with `.single()` (the shared fake has none) resolving to `result`. */
function singleClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'single']) {
    builder[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, args])
      return name === 'single' ? Promise.resolve(result) : builder
    })
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return builder
  })
  return { client: { from } as unknown as SupabaseClient, calls }
}

describe('urls', () => {
  it('builds channel and message links', () => {
    expect(TELEGRAM_URL).toBe('https://t.me/patobarato')
    expect(messageUrl(123)).toBe('https://t.me/patobarato/123')
  })
})

describe('isCtaPlacement', () => {
  it('accepts known placements only', () => {
    expect(isCtaPlacement('deal')).toBe(true)
    expect(isCtaPlacement('x')).toBe(false)
    expect(isCtaPlacement(3)).toBe(false)
    expect(CTA_PLACEMENTS).toHaveLength(7)
  })
})

describe('formatMembers', () => {
  it('hides small or unknown counts', () => {
    expect(formatMembers(null)).toBeNull()
    expect(formatMembers(99)).toBeNull()
    expect(formatMembers(100)).toBe('100')
  })
  it('formats with es-ES grouping', () => {
    expect(formatMembers(1240)).toBe('1.240')
    expect(formatMembers(12400)).toBe('12.400')
  })
})

describe('categoryLabel', () => {
  it('uses the first known category hashtag', () => {
    expect(categoryLabel(['#oferta', '#Tecnologia'])).toBe('tecnología')
    expect(categoryLabel(['#oferta'])).toBeNull()
    expect(categoryLabel([])).toBeNull()
    expect(CATEGORY_TAGS.alimentacion).toBe('alimentación')
  })
})

describe('fetchChannelStats', () => {
  it('maps web_channel_stats snake to camel using single()', async () => {
    const { client, calls } = singleClient({
      data: { members: 1240, checked_at: '2026-11-22T10:00:00Z', posted_today: 4, last_posted_at: '2026-11-22T09:00:00Z' },
      error: null,
    })
    expect(await fetchChannelStats(client)).toEqual({
      members: 1240,
      checkedAt: '2026-11-22T10:00:00Z',
      postedToday: 4,
      lastPostedAt: '2026-11-22T09:00:00Z',
    })
    expect(calls).toContainEqual(['from', ['web_channel_stats']])
    expect(calls.map((c) => c[0])).toContain('single')
  })
  it('maps nulls', async () => {
    const { client } = singleClient({
      data: { members: null, checked_at: null, posted_today: 0, last_posted_at: null },
      error: null,
    })
    expect(await fetchChannelStats(client)).toEqual({ members: null, checkedAt: null, postedToday: 0, lastPostedAt: null })
  })
  it('rejects on error', async () => {
    const { client } = singleClient({ data: null, error: { message: 'boom' } })
    await expect(fetchChannelStats(client)).rejects.toThrow('boom')
  })
})

describe('fetchChannelRecent', () => {
  const row = { product_id: 7, title: 'Aspiradora', price: '49.90', message_id: 55, published_at: '2026-11-22T09:00:00Z' }
  it('maps rows and passes the limit', async () => {
    const { client, calls } = fakeClient({ data: [row], error: null })
    expect(await fetchChannelRecent(client, 2)).toEqual([
      { productId: 7, title: 'Aspiradora', price: 49.9, messageId: 55, publishedAt: '2026-11-22T09:00:00Z' },
    ])
    expect(calls).toContainEqual(['from', ['web_channel_recent']])
    expect(calls).toContainEqual(['order', ['published_at', { ascending: false }]])
    expect(calls).toContainEqual(['limit', [2]])
  })
  it('defaults to 3', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    expect(await fetchChannelRecent(client)).toEqual([])
    expect(calls).toContainEqual(['limit', [3]])
  })
  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchChannelRecent(client)).rejects.toThrow('boom')
  })
})
