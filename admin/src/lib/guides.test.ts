import { describe, expect, it } from 'vitest'
import { getGuide, saveGuide, saveGuideItems, type GuideItemInput } from './guides'

type Call = { table: string; ops: [string, unknown[]][] }

function mockClient(respond: (call: Call) => { data?: unknown; error?: { message: string; code?: string } | null } = () => ({ data: [] })) {
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

const has = (call: Call, name: string) => call.ops.some(([n]) => n === name)
const arg = (call: Call, name: string, i = 0) => call.ops.find(([n]) => n === name)?.[1][i]

function item(over: Partial<GuideItemInput> = {}): GuideItemInput {
  return { name: 'Ninja', award: '', summaryMd: '', pros: [], cons: [], specs: [], imageUrl: '', stores: [], ...over }
}

describe('saveGuideItems', () => {
  it('renumbers positions without clashing', async () => {
    const { client, calls } = mockClient((c) => {
      if (c.table === 'guide_items' && has(c, 'select') && !has(c, 'insert')) return { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
      if (c.table === 'guide_items' && has(c, 'insert')) return { data: [{ id: 10, position: 2 }] }
      return { data: [] }
    })
    await saveGuideItems(client, 7, [item({ id: 3, name: 'C' }), item({ name: 'New' }), item({ id: 1, name: 'A' })])
    const positions = calls
      .filter((c) => c.table === 'guide_items' && (has(c, 'update') || has(c, 'insert')))
      .map((c) => {
        const payload = (arg(c, 'update') ?? arg(c, 'insert')) as Record<string, unknown> | Record<string, unknown>[]
        return Array.isArray(payload) ? payload.map((p) => p.position as number) : [payload.position as number]
      })
      .flat()
    // pass 1: the two kept rows move out of the way (offset); pass 2: final positions 1..n
    expect(positions.slice(0, 2).every((p) => p > 1000)).toBe(true)
    expect(positions.slice(2).sort()).toEqual([1, 2, 3])
  })

  it('removing an item deletes it', async () => {
    const { client, calls } = mockClient((c) => {
      if (c.table === 'guide_items' && has(c, 'select')) return { data: [{ id: 1 }, { id: 2 }] }
      return { data: [] }
    })
    await saveGuideItems(client, 7, [item({ id: 1 })])
    const del = calls.find((c) => c.table === 'guide_items' && has(c, 'delete'))
    expect(del).toBeDefined()
    expect(del!.ops.find(([n]) => n === 'in')?.[1]).toEqual(['id', [2]])
  })

  it('rejects a duplicate store inside an item', async () => {
    const { client, calls } = mockClient()
    const s = { store: 'amazon', externalId: 'B0', url: 'https://a', note: '' }
    await expect(saveGuideItems(client, 7, [item({ name: 'X', stores: [s, { ...s, externalId: 'B1' }] })])).rejects.toThrow(
      'La tienda amazon está repetida en «X»',
    )
    expect(calls).toHaveLength(0)
  })

  it('replaces the stores of an item: deletes removed, updates kept, inserts new', async () => {
    const { client, calls } = mockClient((c) => {
      if (c.table === 'guide_items' && has(c, 'select')) return { data: [{ id: 1 }] }
      if (c.table === 'guide_item_stores' && has(c, 'select')) return { data: [{ id: 5 }, { id: 6 }] }
      return { data: [] }
    })
    await saveGuideItems(client, 7, [
      item({
        id: 1,
        stores: [
          { id: 5, store: 'amazon', externalId: 'B0', url: 'https://a', note: '' },
          { store: 'aliexpress', externalId: '123', url: 'https://b', note: 'desde España' },
        ],
      }),
    ])
    const stores = calls.filter((c) => c.table === 'guide_item_stores')
    const del = stores.find((c) => has(c, 'delete'))
    expect(del!.ops.find(([n]) => n === 'in')?.[1]).toEqual(['id', [6]])
    expect(stores.some((c) => has(c, 'update'))).toBe(true)
    const ins = stores.find((c) => has(c, 'insert'))
    expect((arg(ins!, 'insert') as Record<string, unknown>[])[0]).toMatchObject({ guide_item_id: 1, store: 'aliexpress', note: 'desde España' })
  })
})

describe('saveGuide', () => {
  const base = {
    slug: 'freidoras',
    title: 'Freidoras',
    subtitle: '',
    category: 'Hogar',
    introMd: '',
    howToChooseMd: '',
    faq: [],
    author: 'el Pato',
    readingMinutes: 5,
    publishedAt: null,
  }
  it('sets published_at on first publish and keeps it afterwards', async () => {
    const first = mockClient(() => ({ data: { id: 3 } }))
    await saveGuide(first.client, { ...base, status: 'published' })
    expect(arg(first.calls[0], 'insert')).toMatchObject({ published_at: expect.stringMatching(/^\d{4}-/) })
    const later = mockClient(() => ({ data: { id: 3 } }))
    await saveGuide(later.client, { ...base, id: 3, status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' })
    expect(arg(later.calls[0], 'update')).toMatchObject({ published_at: '2026-01-01T00:00:00.000Z' })
    const draft = mockClient(() => ({ data: { id: 3 } }))
    await saveGuide(draft.client, { ...base, status: 'draft' })
    expect(arg(draft.calls[0], 'insert')).toMatchObject({ published_at: null })
  })
  it('duplicate slug throws Ese slug ya existe', async () => {
    const { client } = mockClient(() => ({ error: { message: 'dup', code: '23505' } }))
    await expect(saveGuide(client, { ...base, status: 'draft' })).rejects.toThrow('Ese slug ya existe')
  })
})

describe('getGuide', () => {
  it('attaches the latest price to each store link, null when none', async () => {
    const { client } = mockClient((c) => {
      if (c.table === 'guides')
        return {
          data: { id: 7, slug: 's', title: 'T', subtitle: null, category: 'Hogar', intro_md: '', how_to_choose_md: '', faq: [], author: 'a', reading_minutes: 5, status: 'draft', published_at: null },
        }
      if (c.table === 'guide_items')
        return { data: [{ id: 1, position: 1, name: 'N', award: null, summary_md: '', pros: [], cons: [], specs: [], image_url: null }] }
      if (c.table === 'guide_item_stores')
        return {
          data: [
            { id: 11, guide_item_id: 1, store: 'amazon', external_id: 'B0', url: 'u', note: null, position: 0 },
            { id: 12, guide_item_id: 1, store: 'aliexpress', external_id: '99', url: 'u2', note: null, position: 1 },
          ],
        }
      if (c.table === 'products') return { data: [{ id: 100, store: 'amazon', asin: 'B0' }] }
      if (c.table === 'product_prices')
        return { data: [{ product_id: 100, price: 19.9, previous_price: 25, currency: 'EUR', checked_at: '2026-11-08T10:00:00Z', error: null }] }
      return { data: [] }
    })
    const g = await getGuide(client, 7)
    const [a, b] = g.items[0].stores
    expect(a.price).toMatchObject({ price: 19.9, previousPrice: 25, currency: 'EUR' })
    expect(b.price).toBeNull()
  })
})
