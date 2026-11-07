import type { GuideItem, GuideStoreOffer } from '../../lib/types'

export const NOW = new Date('2026-11-07T12:00:00Z')

export function offer(over: Partial<GuideStoreOffer> = {}): GuideStoreOffer {
  return {
    store: 'pccomponentes',
    externalId: 'freidora-x',
    url: 'https://www.pccomponentes.com/freidora-x',
    note: null,
    productId: null,
    price: 99.9,
    previousPrice: null,
    currency: 'EUR',
    checkedAt: '2026-11-07T06:00:00Z',
    priceError: false,
    previousMinPrice: null,
    coupon: null,
    ...over,
  }
}

export function item(position: number, over: Partial<GuideItem> = {}): GuideItem {
  return {
    id: position,
    position,
    name: `Freidora ${position}`,
    award: null,
    summaryMd: 'Resumen **claro**.',
    pros: ['Silenciosa'],
    cons: ['Cara'],
    specs: [{ label: 'Capacidad', value: '5 L' }],
    imageUrl: null,
    stores: [offer()],
    ...over,
  }
}
