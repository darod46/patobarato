import { describe, expect, it, vi } from 'vitest'
import { AliExpressError, searchAliExpress, signParams } from './aliexpress'

const creds = { appKey: 'k1', appSecret: 'secret123', trackingId: 'trk' }

describe('signParams', () => {
  it('matches the bot client vector', () => {
    const params = {
      app_key: 'k1',
      timestamp: '1700000000000',
      sign_method: 'sha256',
      method: 'aliexpress.affiliate.product.query',
      v: '2.0',
      format: 'json',
      keywords: 'freidora',
      page_size: '12',
    }
    expect(signParams(params, 'secret123')).toBe(
      'C3261AB39FB2BD556DCD71A07A08542B8DD5A19768F7DDCFF31C80292355B522',
    )
  })

  it('ignores an existing sign key', () => {
    expect(signParams({ a: '1', sign: 'zzz' }, 's')).toBe(signParams({ a: '1' }, 's'))
  })
})

const okBody = (products: unknown[]) => ({
  aliexpress_affiliate_product_query_response: {
    resp_result: {
      resp_code: 200,
      result: { products: { product: products } },
    },
  },
})

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('searchAliExpress', () => {
  it('posts the signed form and maps products', async () => {
    const fetchImpl = reply(
      okBody([
        {
          product_id: 123,
          product_title: 'Freidora X',
          target_sale_price: '55.50',
          target_original_price: '100.00',
          discount: '45%',
          product_main_image_url: 'https://img/a.jpg',
          promotion_link: 'https://s.click/a',
          product_detail_url: 'https://ali/a',
        },
        {
          product_id: 2,
          product_title: 'Sin promo',
          target_sale_price: '10',
          target_original_price: '10',
          product_detail_url: 'https://ali/b',
        },
        {
          product_id: 3,
          product_title: 'Mala',
          target_sale_price: 'abc',
          product_detail_url: 'u',
        },
        {
          product_id: 4,
          product_title: 'Cero',
          target_sale_price: '0',
          product_detail_url: 'u',
        },
        { product_id: 5, product_title: 'Falta', product_detail_url: 'u' },
      ]),
    )
    const out = await searchAliExpress(
      'freidora',
      creds,
      fetchImpl as unknown as typeof fetch,
      () => 1700000000000,
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api-sg.aliexpress.com/sync')
    expect(init.method).toBe('POST')
    const form = new URLSearchParams(init.body as string)
    expect(Object.fromEntries(form)).toMatchObject({
      app_key: 'k1',
      timestamp: '1700000000000',
      sign_method: 'sha256',
      method: 'aliexpress.affiliate.product.query',
      v: '2.0',
      format: 'json',
      keywords: 'freidora',
      ship_to_country: 'ES',
      target_currency: 'EUR',
      target_language: 'ES',
      page_size: '12',
      page_no: '1',
      sort: 'LAST_VOLUME_DESC',
      tracking_id: 'trk',
    })
    const sent = Object.fromEntries(form)
    expect(sent.sign).toBe(
      signParams(Object.fromEntries([...form].filter(([k]) => k !== 'sign')), 'secret123'),
    )
    expect(out).toEqual([
      {
        origin: 'aliexpress',
        store: 'aliexpress',
        externalId: '123',
        title: 'Freidora X',
        price: 55.5,
        originalPrice: 100,
        discountPct: 45,
        currency: 'EUR',
        imageUrl: 'https://img/a.jpg',
        affiliateUrl: 'https://s.click/a',
      },
    ])
  })

  it('computes the discount when the string is missing', async () => {
    const fetchImpl = reply(
      okBody([
        {
          product_id: 1,
          product_title: 't',
          target_sale_price: '75',
          target_original_price: '100',
          promotion_link: 'https://s.click/u',
          product_detail_url: 'u',
        },
      ]),
    )
    const [p] = await searchAliExpress('x', creds, fetchImpl as unknown as typeof fetch)
    expect(p.discountPct).toBe(25)
  })

  it.each(['0%', '100%', '-5', '250%', 'abc'])(
    'falls back to the computed discount when the string is %s',
    async (discount) => {
      const fetchImpl = reply(
        okBody([
          {
            product_id: 1,
            product_title: 't',
            target_sale_price: '75',
            target_original_price: '100',
            promotion_link: 'https://s.click/u',
            product_detail_url: 'u',
            discount,
          },
        ]),
      )
      const [p] = await searchAliExpress('x', creds, fetchImpl as unknown as typeof fetch)
      expect(p.discountPct).toBe(25)
    },
  )

  it('returns an empty list when there are no products', async () => {
    const fetchImpl = reply({
      aliexpress_affiliate_product_query_response: {
        resp_result: { resp_code: 200, result: {} },
      },
    })
    expect(await searchAliExpress('x', creds, fetchImpl as unknown as typeof fetch)).toEqual([])
  })

  it('throws AliExpressError on error_response', async () => {
    const fetchImpl = reply({
      error_response: { code: '29', msg: 'Invalid app Key' },
    })
    await expect(
      searchAliExpress('x', creds, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: 'AliExpressError',
      code: '29',
      msg: 'Invalid app Key',
    })
  })

  it('throws on resp_code != 200 and on HTTP errors', async () => {
    const bad = reply({
      aliexpress_affiliate_product_query_response: {
        resp_result: { resp_code: 405, resp_msg: 'nope' },
      },
    })
    await expect(
      searchAliExpress('x', creds, bad as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(AliExpressError)
    const http = reply({}, 500)
    await expect(
      searchAliExpress('x', creds, http as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(AliExpressError)
  })
})
