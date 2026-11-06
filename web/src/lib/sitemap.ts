import type { MetadataRoute } from 'next'
import { MIN_INDEXABLE_DEALS } from './seo'
import type { StoreStats } from './stores-data'
import type { Deal, HashtagCount } from './types'
import { storeInfo } from './stores'
import { productPath, tagPath } from './urls'

type DealRef = Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>

export const STATIC_PATHS = ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto']

export function buildSitemap(
  deals: DealRef[],
  tags: HashtagCount[],
  siteUrl: string,
  extra: { coupons: boolean; stores?: StoreStats[] } = { coupons: false },
): MetadataRoute.Sitemap {
  const stores = extra.stores ?? []
  return [
    { url: `${siteUrl}/` },
    ...(extra.coupons ? [{ url: `${siteUrl}/cupones` }] : []),
    ...(stores.length >= 2 ? [{ url: `${siteUrl}/tiendas` }] : []),
    ...stores.filter((s) => s.deals >= MIN_INDEXABLE_DEALS).map((s) => ({ url: `${siteUrl}/tiendas/${storeInfo(s.store).slug}` })),
    ...deals.map((d) => ({ url: siteUrl + productPath(d), lastModified: new Date(d.publishedAt) })),
    ...tags.filter((t) => t.count >= MIN_INDEXABLE_DEALS).map((t) => ({ url: siteUrl + tagPath(t.tag) })),
    ...STATIC_PATHS.map((p) => ({ url: siteUrl + p })),
  ]
}

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/go/', '/buscar'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
