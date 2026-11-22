import type { MetadataRoute } from 'next'
import { MIN_INDEXABLE_DEALS } from './seo'
import type { StoreStats } from './stores-data'
import { daysUntil, eventPath, eventPhase } from './events'
import type { Deal, GuideSummary, HashtagCount, PageCopy, SiteEvent } from './types'
import { guidePath } from './guides'
import { storeFromSlug, storeInfo } from './stores'
import { productPath, tagPath } from './urls'

export type DealRef = Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>

/** The sitemaps listed by the index at `/sitemap.xml`, each served at `/sitemaps/{name}.xml`. */
export const SITEMAP_NAMES = ['chollos', 'paginas', 'eventos'] as const
export type SitemapName = (typeof SITEMAP_NAMES)[number]

export function isSitemapName(name: string): name is SitemapName {
  return (SITEMAP_NAMES as readonly string[]).includes(name)
}

export const STATIC_PATHS = ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto', '/sobre-nosotros']

/** Listing pages, always indexable: each has an editorial copy (kind `static`, slug = path without `/`). */
const LISTING_PATHS = ['/chollos', '/buscar', '/tiendas', '/cupones', '/guias']

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>'
const XMLNS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function isoDate(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

/** `<sitemapindex>` pointing at every sitemap, with its lastmod when known. */
export function buildSitemapIndex(siteUrl: string, lastmods: Partial<Record<SitemapName, Date>>): string {
  const items = SITEMAP_NAMES.map((name) => {
    const lastmod = lastmods[name]
    return `<sitemap><loc>${escapeXml(`${siteUrl}/sitemaps/${name}.xml`)}</loc>${lastmod ? `<lastmod>${isoDate(lastmod)}</lastmod>` : ''}</sitemap>`
  })
  return `${XML_HEAD}\n<sitemapindex xmlns="${XMLNS}">\n${items.join('\n')}\n</sitemapindex>\n`
}

/** `<urlset>` with loc, lastmod (ISO), changefreq and priority. */
export function buildSitemapXml(entries: MetadataRoute.Sitemap): string {
  const items = entries.map((e) => {
    let item = `<url><loc>${escapeXml(e.url)}</loc>`
    if (e.lastModified !== undefined) item += `<lastmod>${isoDate(e.lastModified)}</lastmod>`
    if (e.changeFrequency) item += `<changefreq>${e.changeFrequency}</changefreq>`
    if (e.priority !== undefined) item += `<priority>${e.priority}</priority>`
    return item + '</url>'
  })
  return `${XML_HEAD}\n<urlset xmlns="${XMLNS}">\n${items.join('\n')}${items.length ? '\n' : ''}</urlset>\n`
}

/** `chollos` sitemap: one entry per deal page. */
export function dealEntries(deals: DealRef[], siteUrl: string): MetadataRoute.Sitemap {
  return deals.map((d) => ({
    url: siteUrl + productPath(d),
    lastModified: new Date(d.publishedAt),
    changeFrequency: 'daily' as const,
  }))
}

/**
 * `paginas` sitemap: home, listings, indexable categories and stores, guides and
 * static pages. `lastmod` comes from the page copy (`updated_at`) or the guide when there is one.
 */
export function pageEntries({
  siteUrl,
  tags,
  stores,
  guides,
  copies,
}: {
  siteUrl: string
  tags: HashtagCount[]
  stores: StoreStats[]
  guides: GuideSummary[]
  copies: PageCopy[]
}): MetadataRoute.Sitemap {
  const updated = (kind: PageCopy['kind'], slug: string) => {
    const c = copies.find((x) => x.kind === kind && x.slug === slug)
    return c ? { lastModified: new Date(c.updatedAt) } : {}
  }
  const staticEntry = (path: string) => ({ url: siteUrl + path, ...updated('static', path.slice(1)) })
  // Same rule as the category page (spec §6): it exists with at least one deal (404 otherwise) and is
  // indexable with an editorial copy or with at least 3 deals.
  const categoryListed = (t: HashtagCount) =>
    t.count >= 1 && (t.count >= MIN_INDEXABLE_DEALS || copies.some((c) => c.kind === 'category' && c.slug === t.tag))
  // Same rule as the store page (spec §6): indexable with an editorial copy or with at least 3 deals.
  // Only stores known to STORES: an unknown id would be a 404.
  const storeIds = [
    ...stores.filter((s) => s.deals >= MIN_INDEXABLE_DEALS).map((s) => s.store),
    ...copies.filter((c) => c.kind === 'store').map((c) => c.slug),
  ].filter((id, i, all) => storeFromSlug(id) !== null && all.indexOf(id) === i)
  return [
    { url: `${siteUrl}/` },
    ...LISTING_PATHS.map(staticEntry),
    ...tags.filter(categoryListed).map((t) => ({ url: siteUrl + tagPath(t.tag), ...updated('category', t.tag) })),
    ...storeIds.map((id) => ({ url: `${siteUrl}/tiendas/${storeInfo(id).slug}`, ...updated('store', id) })),
    ...guides.map((g) => ({ url: siteUrl + guidePath(g.slug), lastModified: new Date(g.updatedAt) })),
    ...STATIC_PATHS.map(staticEntry),
  ]
}

/** `eventos` sitemap: `/eventos` (always) and each event; priority 0.9 within 60 days or during, else 0.6. */
export function eventEntries(events: SiteEvent[], siteUrl: string, now: Date): MetadataRoute.Sitemap {
  const priority = (e: SiteEvent) => {
    const days = daysUntil(e, now)
    return eventPhase(e, now) === 'during' || (days >= 0 && days <= 60) ? 0.9 : 0.6
  }
  return [
    { url: `${siteUrl}/eventos`, changeFrequency: 'weekly' as const, priority: 0.7 },
    ...events.map((e) => ({
      url: siteUrl + eventPath(e.slug),
      lastModified: new Date(e.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: priority(e),
    })),
  ]
}

/** Latest of the given dates, or undefined when there is none. */
export function latest(dates: (string | Date | undefined)[]): Date | undefined {
  const times = dates.filter((d) => d !== undefined).map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t))
  return times.length ? new Date(Math.max(...times)) : undefined
}

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/go/', '/api/'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
