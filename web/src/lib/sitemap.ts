import type { MetadataRoute } from 'next'
import { MIN_INDEXABLE_DEALS } from './seo'
import type { StoreStats } from './stores-data'
import type { Deal, GuideSummary, HashtagCount } from './types'
import { guidePath } from './guides'
import { storeFromSlug, storeInfo } from './stores'
import { productPath, tagPath } from './urls'

type DealRef = Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>

export const STATIC_PATHS = ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto']

export function buildSitemap(
  deals: DealRef[],
  tags: HashtagCount[],
  siteUrl: string,
  extra: { coupons: boolean; stores?: StoreStats[]; guides?: GuideSummary[] } = { coupons: false },
): MetadataRoute.Sitemap {
  // Same filter as fetchStores, kept here so the sitemap never lists an unknown store.
  const stores = (extra.stores ?? []).filter((s) => storeFromSlug(s.store) !== null)
  // Published guides are listed even without prices: the page itself is noindex until its prices are fresh.
  const guides = extra.guides ?? []
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/chollos` },
    ...(extra.coupons ? [{ url: `${siteUrl}/cupones` }] : []),
    ...(stores.length >= 2 ? [{ url: `${siteUrl}/tiendas` }] : []),
    ...stores.filter((s) => s.deals >= MIN_INDEXABLE_DEALS).map((s) => ({ url: `${siteUrl}/tiendas/${storeInfo(s.store).slug}` })),
    ...(guides.length > 0 ? [{ url: `${siteUrl}/guias` }] : []),
    ...guides.map((g) => ({ url: siteUrl + guidePath(g.slug), lastModified: new Date(g.updatedAt) })),
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
