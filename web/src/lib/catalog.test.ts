import { describe, expect, it } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import { fetchCatalogSearch } from './catalog'

const row = {
  store: 'pccomponentes',
  external_id: 'p1',
  title: 'Freidora',
  price: '100.00',
  sale_price: '80.00',
  currency: 'EUR',
  image_url: 'https://img/x.jpg',
  affiliate_url: 'https://aff/x',
}

describe('fetchCatalogSearch', () => {
  it('calls the rpc with q and max and maps sale/previous prices', async () => {
    const { client, calls } = fakeClient({ data: [row], error: null })
    const out = await fetchCatalogSearch(client, 'freidora')
    expect(calls).toContainEqual(['rpc', ['web_catalog_search', { q: 'freidora', max: 12 }]])
    expect(out).toEqual([
      {
        origin: 'awin',
        store: 'pccomponentes',
        externalId: 'p1',
        title: 'Freidora',
        price: 80,
        originalPrice: 100,
        discountPct: 20,
        currency: 'EUR',
        imageUrl: 'https://img/x.jpg',
        affiliateUrl: 'https://aff/x',
      },
    ])
  })

  it('uses the plain price when there is no sale price', async () => {
    const { client } = fakeClient({
      data: [{ ...row, sale_price: null }],
      error: null,
    })
    const [p] = await fetchCatalogSearch(client, 'x', 5)
    expect(p).toMatchObject({
      price: 100,
      originalPrice: null,
      discountPct: null,
    })
  })

  it('throws on rpc errors', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchCatalogSearch(client, 'x')).rejects.toThrow('boom')
  })
})
