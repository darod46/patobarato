import type { MetadataRoute } from 'next'
import { MIN_INDEXABLE_DEALS } from './seo'
import type { Deal, HashtagCount } from './types'
import { productPath, tagPath } from './urls'

type DealRef = Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>

export const STATIC_PATHS = ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto']

export function buildSitemap(
  deals: DealRef[],
  tags: HashtagCount[],
  siteUrl: string,
  extra: { coupons: boolean } = { coupons: false },
): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/` },
    ...(extra.coupons ? [{ url: `${siteUrl}/cupones` }] : []),
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
