import { describe, expect, it } from 'vitest'
import type { PostInput } from './telegram-format'
import { whatsappCoupon, whatsappEvent, whatsappGuide, whatsappOffer } from './whatsapp'
import { storeName } from './stores'

const base: PostInput = {
  title: 'Sony WH-1000XM5',
  price: 149,
  previousPrice: 199,
  coupon: 'SONY10',
  hashtags: ['Auriculares', 'sony'],
  link: 'https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21',
  storeName: 'Amazon',
  priceBeforeCoupon: false,
  ended: false,
}

describe('whatsappOffer', () => {
  it('builds the offer with the same lines as Telegram', () => {
    expect(whatsappOffer(base)).toBe(
      [
        '*Sony WH-1000XM5*',
        '✅ Precio: *149,00 €*',
        '❌ Antes: ~199,00 €~ (-25%)',
        '🎟️ Cupón: `SONY10`',
        '🛒 Ver en Amazon: https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21',
        '',
        '#auriculares #sony',
      ].join('\n'),
    )
  })

  it('builds the ended offer with a struck price', () => {
    const text = whatsappOffer({ ...base, ended: true, previousPrice: null, coupon: null, hashtags: [] })
    expect(text).toBe(
      [
        '❌ *OFERTA TERMINADA*',
        '*Sony WH-1000XM5*',
        '✅ Precio: ~149,00 €~',
        '🛒 Ver en Amazon: https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21',
      ].join('\n'),
    )
  })

  it('labels a price before the coupon and strips links from the title', () => {
    const text = whatsappOffer({ ...base, title: 'Sony https://amzn.to/3abc XM5', priceBeforeCoupon: true })
    expect(text).toContain('*Sony XM5*')
    expect(text).toContain('✅ Precio sin cupón: *149,00 €*')
  })
})

describe('whatsappCoupon', () => {
  it('omits the expiry line when there is none', () => {
    expect(
      whatsappCoupon({ store: 'amazon', title: '10% en todo', code: 'HOLA10', conditions: null, expiresAt: null, url: 'https://x.es/c' }),
    ).toBe(['🎟️ *10% en todo*', 'Tienda: Amazon', 'Código: `HOLA10`', 'https://x.es/c'].join('\n'))
  })

  it('shows the expiry in Europe/Madrid', () => {
    const text = whatsappCoupon({
      store: 'pccomponentes',
      title: 'Cupón',
      code: 'X',
      conditions: 'Compra mínima 50 €',
      expiresAt: '2026-12-31T23:30:00Z',
      url: 'https://x.es/c',
    })
    expect(text).toContain('Caduca el 01/01/2027')
    expect(text).toContain('Compra mínima 50 €')
    expect(text).toContain('Tienda: PcComponentes')
  })
})

describe('whatsappGuide / whatsappEvent', () => {
  it('links the guide', () => {
    expect(whatsappGuide({ title: 'Freidoras', subtitle: 'Cuál comprar', slug: 'freidoras' }, 'https://patobarato.es')).toBe(
      ['📖 *Freidoras*', 'Cuál comprar', '', 'https://patobarato.es/guias/freidoras'].join('\n'),
    )
  })

  it('reduces the event intro to its first paragraph as plain text', () => {
    const introMd = '## Black **Friday** 2026\nLas _mejores_ [ofertas](https://x.es) con `código`.\n\nSegundo párrafo que no sale.'
    expect(whatsappEvent({ name: 'Black Friday', introMd, slug: 'black-friday' }, 'https://patobarato.es')).toBe(
      [
        '🎉 *Black Friday*',
        '',
        'Black Friday 2026 Las mejores ofertas con código.',
        '',
        'https://patobarato.es/eventos/black-friday',
      ].join('\n'),
    )
  })

  it('keeps snake_case words intact', () => {
    expect(whatsappEvent({ name: 'E', introMd: 'usa mi_codigo_x aquí', slug: 'e' }, 'https://w')).toContain('mi_codigo_x')
  })
})

describe('storeName', () => {
  it('maps known ids and falls back to the id', () => {
    expect(storeName('amazon')).toBe('Amazon')
    expect(storeName('elcorteingles')).toBe('El Corte Inglés')
    expect(storeName('otra')).toBe('otra')
  })
})
