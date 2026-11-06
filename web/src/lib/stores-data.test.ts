import { describe, expect, it } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import { fetchStores } from './stores-data'

describe('fetchStores', () => {
  it('maps web_stores rows and drops stores without deals or coupons', async () => {
    const { client, calls } = fakeClient({
      data: [
        { store: 'amazon', deals: '10', coupons: 0 },
        { store: 'aliexpress', deals: 0, coupons: '2' },
        { store: 'decathlon', deals: 0, coupons: 0 },
      ],
      error: null,
    })
    expect(await fetchStores(client)).toEqual([
      { store: 'amazon', deals: 10, coupons: 0 },
      { store: 'aliexpress', deals: 0, coupons: 2 },
    ])
    expect(calls).toContainEqual(['from', ['web_stores']])
  })

  it('throws on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchStores(client)).rejects.toThrow('boom')
  })
})
