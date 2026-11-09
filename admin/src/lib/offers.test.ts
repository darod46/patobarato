import { describe, expect, it } from 'vitest'
import { parseMoney } from './money'
import { getOffer, listOffers, recentTelegramPublication, saveOffer, setOfferStatus } from './offers'

type Call = { table: string; ops: [string, unknown[]][] }

/** Chainable PostgREST mock: records every call and resolves to `respond(call)`. */
function mockClient(respond: (call: Call) => { data?: unknown; error?: { message: string } | null } = () => ({ data: null })) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const res = { error: null, ...respond(call) }
              return (resolve: (v: unknown) => void) => resolve(res)
            }
            return (...args: unknown[]) => {
              call.ops.push([prop, args])
              return chain
            }
          },
        },
      )
      return chain
    },
  }
  return { client: client as never, calls }
}

const op = (call: Call, name: string) => call.ops.find(([n]) => n === name)?.[1]

describe('saveOffer', () => {
  it('saveOffer writes the three tables', async () => {
    const { client, calls } = mockClient((c) =>
      c.ops.some(([n]) => n === 'select') ? { data: { offer_id: 7, product_id: 9 } } : { data: null },
    )
    await saveOffer(client, 5, {
      title: 'Nuevo título',
      price: 19.9,
      previousPrice: 30,
      coupon: 'AHORRA',
      priceBeforeCoupon: true,
      hashtags: ['tech'],
    })
    const writes = calls.filter((c) => op(c, 'update'))
    const products = writes.find((c) => c.table === 'products')!
    expect(op(products, 'update')).toEqual([{ title: 'Nuevo título' }])
    expect(op(products, 'eq')).toEqual(['id', 9])
    const pubs = writes.find((c) => c.table === 'publications')!
    expect(op(pubs, 'update')).toEqual([{ published_price: 19.9, price_before_coupon: true }])
    expect(op(pubs, 'eq')).toEqual(['id', 5])
    const offers = writes.find((c) => c.table === 'offers')!
    expect(op(offers, 'update')).toEqual([{ previous_price: 30, coupon: 'AHORRA', hashtags: ['tech'] }])
    expect(op(offers, 'eq')).toEqual(['id', 7])
  })

  it('throws the database error', async () => {
    const { client } = mockClient(() => ({ data: null, error: { message: 'rls' } }))
    await expect(
      saveOffer(client, 1, { title: 't', price: 1, previousPrice: null, coupon: null, priceBeforeCoupon: false, hashtags: [] }),
    ).rejects.toThrow('rls')
  })
})

describe('setOfferStatus', () => {
  it('sets ended_at when ended and clears it when reactivated', async () => {
    const a = mockClient()
    await setOfferStatus(a.client, 3, 'ended')
    const ended = (op(a.calls[0], 'update') as [Record<string, unknown>])[0]
    expect(ended.status).toBe('ended')
    expect(typeof ended.ended_at).toBe('string')
    const b = mockClient()
    await setOfferStatus(b.client, 3, 'active')
    expect(op(b.calls[0], 'update')).toEqual([{ status: 'active', ended_at: null }])
  })
})

describe('listOffers', () => {
  it('filters by status, newest first, limit 200, and maps rows', async () => {
    const { client, calls } = mockClient(() => ({
      data: [
        {
          id: 1,
          status: 'active',
          channel: 'telegram',
          message_id: 10,
          published_price: '12.5',
          published_at: '2026-11-01T10:00:00Z',
          products: { title: 'Ratón', store: 'amazon', image_url: 'https://i/x.jpg' },
        },
      ],
    }))
    const rows = await listOffers(client, { filter: 'active', q: '' })
    expect(op(calls[0], 'eq')).toEqual(['status', 'active'])
    expect(op(calls[0], 'order')).toEqual(['published_at', { ascending: false }])
    expect(op(calls[0], 'limit')).toEqual([200])
    expect(op(calls[0], 'ilike')).toBeUndefined()
    expect(rows[0]).toMatchObject({ id: 1, title: 'Ratón', price: 12.5, hasMessage: true, channel: 'telegram' })
  })

  it('searches the embedded product title with an inner join', async () => {
    const { client, calls } = mockClient(() => ({ data: [] }))
    await listOffers(client, { filter: 'draft', q: 'rat' })
    expect(op(calls[0], 'ilike')).toEqual(['products.title', '%rat%'])
    expect(String((op(calls[0], 'select') as string[])[0])).toContain('products!inner')
  })
})

describe('getOffer', () => {
  it('maps the joined row and finds the bot duplicate for drafts', async () => {
    const { client } = mockClient((c) => {
      if (c.ops.some(([n]) => n === 'single')) {
        return {
          data: {
            id: 4,
            offer_id: 2,
            product_id: 8,
            status: 'draft',
            channel: 'telegram',
            message_id: null,
            published_price: 10,
            price_before_coupon: false,
            affiliate_url: 'https://a/b',
            published_at: '2026-11-01T10:00:00Z',
            offers: { previous_price: 20, coupon: null, hashtags: ['x'] },
            products: { title: 'T', store: 'amazon', image_url: null },
          },
        }
      }
      return { data: [{ published_at: '2026-11-02T10:00:00Z' }] }
    })
    const d = await getOffer(client, 4)
    expect(d).toMatchObject({ id: 4, offerId: 2, productId: 8, previousPrice: 20, hashtags: ['x'], botPublishedAt: '2026-11-02T10:00:00Z' })
  })
})

describe('recentTelegramPublication', () => {
  it('queries active/ended telegram posts of the product within the window', async () => {
    const { client, calls } = mockClient(() => ({ data: [{ published_at: '2026-11-07T00:00:00Z' }] }))
    const r = await recentTelegramPublication(client, 8, 7)
    expect(r).toBe('2026-11-07T00:00:00Z')
    expect(calls[0].table).toBe('publications')
    expect(calls[0].ops).toContainEqual(['eq', ['product_id', 8]])
    expect(calls[0].ops).toContainEqual(['eq', ['channel', 'telegram']])
    expect(calls[0].ops).toContainEqual(['in', ['status', ['active', 'ended']]])
  })

  it('returns null when there is none', async () => {
    const { client } = mockClient(() => ({ data: [] }))
    expect(await recentTelegramPublication(client, 8)).toBeNull()
  })
})

describe('parseMoney', () => {
  it('accepts Spanish decimals', () => {
    expect(parseMoney('149,99')).toBe(149.99)
    expect(parseMoney('1.299,90 €')).toBe(1299.9)
    expect(parseMoney('20')).toBe(20)
    expect(parseMoney('12.5')).toBe(12.5)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})
