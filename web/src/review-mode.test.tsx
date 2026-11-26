// The site while Amazon Associates reviews it (lib/flags.ts): no Amazon prices and no Telegram channel.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DealCard } from './components/DealCard'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ProductView } from './components/ProductView'
import { fetchDeals } from './lib/deals'
import { FLAGS, pricesVisible } from './lib/flags'
import { productJsonLd, productMetadata } from './lib/seo'
import type { Deal } from './lib/types'
import { fakeClient } from './test-utils/fakeClient'

beforeEach(() => {
  FLAGS.amazonPrices = false
  FLAGS.telegram = false
})

const row = (store: string) => ({
  publication_id: 1,
  published_at: '2026-11-26T10:00:00Z',
  price: '29.99',
  previous_price: '49.99',
  coupon: 'Código PATO5',
  hashtags: ['hogar'],
  affiliate_url: 'https://www.amazon.es/dp/B0ABCDEF12?tag=patobarato-21',
  title: 'Robot aspirador',
  image_url: null,
  asin: 'B0ABCDEF12',
  country: 'ES',
  store,
  product_id: 1,
  discount_pct: 40,
  previous_min_price: '34.99',
  is_lowest: true,
  price_before_coupon: true,
})

async function dealFrom(store: string): Promise<Deal> {
  const { client } = fakeClient({ data: [row(store)], error: null })
  return (await fetchDeals(client, { page: 0 })).deals[0]
}

describe('review mode: Amazon prices', () => {
  it('only Amazon prices are hidden', () => {
    expect(pricesVisible('amazon')).toBe(false)
    expect(pricesVisible('aliexpress')).toBe(true)
  })

  it('Amazon deals leave the server without any price field; other stores keep theirs', async () => {
    const amazon = await dealFrom('amazon')
    expect(amazon).toMatchObject({
      priceHidden: true,
      price: 0,
      previousPrice: null,
      discountPct: null,
      previousMinPrice: null,
      isLowest: false,
      priceBeforeCoupon: false,
      coupon: 'Código PATO5',
    })
    const ali = await dealFrom('aliexpress')
    expect(ali.priceHidden).toBeUndefined()
    expect(ali).toMatchObject({ price: 29.99, previousPrice: 49.99, discountPct: 40, isLowest: true })
  })

  it('the card shows where to see the price, never a price', async () => {
    render(<DealCard deal={await dealFrom('amazon')} now={new Date('2026-11-26T12:00:00Z')} />)
    expect(screen.getByTestId('price-hidden')).toHaveTextContent('Precio en Amazon')
    expect(document.body.textContent).not.toMatch(/€|%|Mínimo histórico/)
  })

  it('the deal page has no price, no saving and a «Ver precio en Amazon» button', async () => {
    const deal = await dealFrom('amazon')
    render(<ProductView deal={deal} related={[]} now="2026-11-26T12:00:00Z" />)
    expect(screen.getByTestId('price-hidden')).toHaveTextContent('Consulta el precio y la disponibilidad en Amazon España.')
    expect(screen.getAllByRole('link', { name: /Ver precio en Amazon/ }).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/\d,\d\d €|Ahorras|Mínimo histórico|El precio puede cambiar/)
  })

  it('titles, descriptions and structured data carry no price', async () => {
    const deal = await dealFrom('amazon')
    const meta = productMetadata(deal, new Date('2026-11-26T12:00:00Z'))
    expect(meta.title).toBe('Robot aspirador · Oferta en Amazon · PatoBarato')
    expect(String(meta.description)).not.toMatch(/€|%/)
    expect(String(meta.description)).toContain('Consulta el precio en la tienda.')
    expect(productJsonLd(deal, 'https://www.patobarato.com/x')).not.toHaveProperty('offers')
  })
})

describe('review mode: no Telegram channel', () => {
  it('the header and the footer have no channel link', () => {
    render(
      <>
        <Header />
        <Footer year={2026} />
      </>,
    )
    expect(screen.queryByRole('link', { name: /canal|Telegram/i })).toBeNull()
    expect(document.querySelector('a[href*="t.me"]')).toBeNull()
  })

  it('the hero has no Telegram button and does not promise Amazon prices', () => {
    const none = { topDiscountPct: null, topDiscountTitle: null, latestCouponTitle: null, hasLowest: false }
    render(<Hero highlights={none} storeNames={['Amazon', 'AliExpress']} members="1.234" />)
    expect(document.querySelector('a[href*="t.me"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Telegram|suscriptores|Precio comprobado|el precio anterior/)
    expect(document.body.textContent).toContain('Enlace directo a la tienda')
  })

  it('the deal page has no «¿Se te ha escapado?» channel card', async () => {
    render(<ProductView deal={await dealFrom('aliexpress')} related={[]} now="2026-11-26T12:00:00Z" />)
    expect(screen.queryByText('¿Se te ha escapado?')).toBeNull()
    expect(document.querySelector('a[href*="t.me"]')).toBeNull()
  })
})
