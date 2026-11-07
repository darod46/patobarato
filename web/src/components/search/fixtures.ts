import type { CatalogProduct } from '../../lib/catalog'

export function product(over: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    origin: 'awin',
    store: 'pccomponentes',
    externalId: 'p1',
    title: 'Ratón inalámbrico',
    price: 19.99,
    originalPrice: null,
    discountPct: null,
    currency: 'EUR',
    imageUrl: 'https://img.example/a.jpg',
    affiliateUrl: 'https://track.example/go?x=1',
    ...over,
  }
}
