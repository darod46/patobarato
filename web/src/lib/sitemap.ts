import type { MetadataRoute } from 'next'
import { MIN_INDEXABLE_DEALS } from './seo'
import type { StoreStats } from './stores-data'
import { daysUntil, eventPath, eventPhase } from './events'
import type { Deal, GuideSummary, HashtagCount, SiteEvent } from './types'
import { guidePath } from './guides'
import { storeFromSlug, storeInfo } from './stores'
import { productPath, tagPath } from './urls'

type DealRef = Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>

export const STATIC_PATHS = ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto']

export function buildSitemap(
  deals: DealRef[],
  tags: HashtagCount[],
  siteUrl: string,
  extra: { coupons: boolean; stores?: StoreStats[]; guides?: GuideSummary[]; events?: SiteEvent[]; now?: Date } = { coupons: false },
): MetadataRoute.Sitemap {
  // Same filter as fetchStores, kept here so the sitemap never lists an unknown store.
  const stores = (extra.stores ?? []).filter((s) => storeFromSlug(s.store) !== null)
  // Published guides are listed even without prices: the page itself is noindex until its prices are fresh.
  const guides = extra.guides ?? []
  const events = extra.events ?? []
  const now = extra.now ?? new Date()
  const eventPriority = (e: SiteEvent) => {
    const days = daysUntil(e, now)
    return eventPhase(e, now) === 'during' || (days >= 0 && days <= 60) ? 0.9 : 0.6
  }
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/chollos` },
    { url: `${siteUrl}/buscar` },
    ...(extra.coupons ? [{ url: `${siteUrl}/cupones` }] : []),
    ...(stores.length >= 2 ? [{ url: `${siteUrl}/tiendas` }] : []),
    ...stores.filter((s) => s.deals >= MIN_INDEXABLE_DEALS).map((s) => ({ url: `${siteUrl}/tiendas/${storeInfo(s.store).slug}` })),
    ...(guides.length > 0 ? [{ url: `${siteUrl}/guias` }] : []),
    ...guides.map((g) => ({ url: siteUrl + guidePath(g.slug), lastModified: new Date(g.updatedAt) })),
    ...(events.length > 0 ? [{ url: `${siteUrl}/eventos`, changeFrequency: 'weekly' as const, priority: 0.7 }] : []),
    ...events.map((e) => ({
      url: siteUrl + eventPath(e.slug),
      lastModified: new Date(e.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: eventPriority(e),
    })),
    ...deals.map((d) => ({ url: siteUrl + productPath(d), lastModified: new Date(d.publishedAt) })),
    ...tags.filter((t) => t.count >= MIN_INDEXABLE_DEALS).map((t) => ({ url: siteUrl + tagPath(t.tag) })),
    ...STATIC_PATHS.map((p) => ({ url: siteUrl + p })),
  ]
}

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/go/'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
