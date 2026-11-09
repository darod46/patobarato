import { describe, expect, it } from 'vitest'
import { listCoupons, saveCoupon, searchPattern, type CouponInput } from './coupons'

type Call = { table: string; ops: [string, unknown[]][] }

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

const ops = (call: Call, name: string) => call.ops.filter(([n]) => n === name).map(([, a]) => a)

const input: CouponInput = {
  store: 'amazon',
  code: 'AHORRA10',
  title: '10% extra',
  conditions: null,
  url: null,
  startsAt: '2026-11-09T09:00:00.000Z',
  expiresAt: null,
  active: true,
  discountAmount: null,
  discountPct: 10,
  minPurchase: 50,
  eventId: 3,
}

describe('listCoupons', () => {
  it('active filter requires active and not expired', async () => {
    const { client, calls } = mockClient(() => ({ data: [] }))
    await listCoupons(client, { filter: 'active' })
    expect(calls[0].table).toBe('coupons')
    expect(ops(calls[0], 'eq')).toEqual([['active', true]])
    expect(String(ops(calls[0], 'or')[0][0])).toMatch(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-/)
  })
  it('expired filter is expired or inactive', async () => {
    const { client, calls } = mockClient(() => ({ data: [] }))
    await listCoupons(client, { filter: 'expired' })
    expect(String(ops(calls[0], 'or')[0][0])).toMatch(/^expires_at\.lte\.\d{4}-.*,active\.eq\.false$/)
  })
  it('all filter has no status condition', async () => {
    const { client, calls } = mockClient(() => ({ data: [] }))
    await listCoupons(client, { filter: 'all' })
    expect(ops(calls[0], 'or')).toEqual([])
    expect(ops(calls[0], 'eq')).toEqual([])
  })
  it('search matches title or code and escapes wildcards', async () => {
    const { client, calls } = mockClient(() => ({ data: [] }))
    await listCoupons(client, { filter: 'all', q: '10%_off' })
    expect(ops(calls[0], 'or')).toEqual([['title.ilike."%10\\\\%\\\\_off%",code.ilike."%10\\\\%\\\\_off%"']])
  })
  it('maps rows', async () => {
    const { client } = mockClient(() => ({
      data: [{ id: 1, store: 'amazon', code: 'X', title: 'T', expires_at: null, active: true }],
    }))
    expect(await listCoupons(client, { filter: 'all' })).toEqual([
      { id: 1, store: 'amazon', code: 'X', title: 'T', expiresAt: null, active: true },
    ])
  })
})

describe('searchPattern', () => {
  it('quotes and escapes', () => {
    expect(searchPattern('a,b')).toBe('"%a,b%"')
    expect(searchPattern('50%')).toBe('"%50\\\\%%"')
    expect(searchPattern('a"b')).toBe('"%a\\"b%"')
  })
})

describe('saveCoupon', () => {
  it('inserts without id and returns the new id', async () => {
    const { client, calls } = mockClient(() => ({ data: { id: 42 } }))
    expect(await saveCoupon(client, input)).toBe(42)
    expect(ops(calls[0], 'upsert')).toHaveLength(0)
    expect(ops(calls[0], 'update')).toHaveLength(0)
    const row = ops(calls[0], 'insert')[0][0] as Record<string, unknown>
    expect(row).not.toHaveProperty('id')
    expect(row).toMatchObject({
      store: 'amazon',
      code: 'AHORRA10',
      starts_at: '2026-11-09T09:00:00.000Z',
      discount_pct: 10,
      min_purchase: 50,
      event_id: 3,
      expires_at: null,
    })
  })
  it('updates by id', async () => {
    const { client, calls } = mockClient(() => ({ data: { id: 5 } }))
    expect(await saveCoupon(client, { ...input, id: 5, startsAt: null })).toBe(5)
    expect(ops(calls[0], 'upsert')).toHaveLength(0)
    expect(ops(calls[0], 'insert')).toHaveLength(0)
    expect(ops(calls[0], 'eq')).toEqual([['id', 5]])
    const row = ops(calls[0], 'update')[0][0] as Record<string, unknown>
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('starts_at')
  })
  it('throws on error', async () => {
    const { client } = mockClient(() => ({ error: { message: 'boom' } }))
    await expect(saveCoupon(client, input)).rejects.toThrow('boom')
  })
})
