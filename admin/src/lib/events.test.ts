import { describe, expect, it } from 'vitest'
import { saveEvent, type EventInput } from './events'

type Call = { table: string; ops: [string, unknown[]][] }

function mockClient(respond: (call: Call) => { data?: unknown; error?: { message: string; code?: string } | null }) {
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

const input: EventInput = {
  slug: 'black-friday',
  name: 'Black Friday',
  stores: ['amazon'],
  startsOn: '2026-11-20',
  endsOn: '2026-11-30',
  approximate: false,
  hashtags: ['blackfriday'],
  aliexpressPromo: null,
  introMd: '',
  tipsMd: '',
  faq: [],
  status: 'draft',
}

describe('saveEvent', () => {
  it('inserts without id and never upserts', async () => {
    const { client, calls } = mockClient(() => ({ data: { id: 8 } }))
    expect(await saveEvent(client, input)).toBe(8)
    expect(ops(calls[0], 'upsert')).toHaveLength(0)
    expect(ops(calls[0], 'update')).toHaveLength(0)
    const row = ops(calls[0], 'insert')[0][0] as Record<string, unknown>
    expect(row).not.toHaveProperty('id')
    expect(row.slug).toBe('black-friday')
  })

  it('updates by id without sending the id and never upserts', async () => {
    const { client, calls } = mockClient(() => ({ data: { id: 3 } }))
    expect(await saveEvent(client, { ...input, id: 3 })).toBe(3)
    expect(ops(calls[0], 'upsert')).toHaveLength(0)
    expect(ops(calls[0], 'insert')).toHaveLength(0)
    expect(ops(calls[0], 'eq')).toEqual([['id', 3]])
    expect(ops(calls[0], 'update')[0][0]).not.toHaveProperty('id')
  })

  it('maps a unique violation to the duplicate slug message', async () => {
    const { client } = mockClient(() => ({ error: { message: 'dup', code: '23505' } }))
    await expect(saveEvent(client, input)).rejects.toThrow('Ese slug ya existe')
  })
})
