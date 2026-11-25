import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { fetchAllDealRefs } from './deals'
import { loadSitemapXml } from './sitemap-data'
import { buildRobots, buildSitemapIndex, buildSitemapXml, dealEntries, eventEntries, pageEntries, SITEMAP_NAMES } from './sitemap'
import { siteEvent } from '../test-utils/siteEvent'
import type { GuideSummary, PageCopy } from './types'
import { SITE_URL } from './urls'

vi.mock('./deals', async (orig) => ({ ...(await orig<typeof import('./deals')>()), fetchAllDealRefs: vi.fn(async () => []) }))

const deals = [
  { store: 'amazon', asin: 'B0ABCDEF12', title: 'Freidora de aire', publishedAt: '2026-11-04T11:19:00Z' },
  { store: 'amazon', asin: 'B0ZZZZZZ99', title: 'Café molido', publishedAt: '2026-11-03T08:00:00Z' },
]

const copy = (kind: PageCopy['kind'], slug: string, updatedAt: string): PageCopy => ({
  kind,
  slug,
  title: slug,
  h1: slug,
  introMd: '',
  faq: [],
  updatedAt,
})

const NOW = new Date('2026-11-22T12:00:00Z')

const guide = (slug: string, updatedAt: string, pricesCheckedAt: string | null = '2026-11-22T06:00:00Z'): GuideSummary => ({
  slug,
  title: slug,
  subtitle: null,
  category: 'Hogar',
  author: 'el Pato',
  readingMinutes: 5,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt,
  items: 3,
  pricesCheckedAt,
})

describe('buildSitemapIndex', () => {
  it('lists the three sitemaps with absolute URLs and optional lastmod', () => {
    const xml = buildSitemapIndex(SITE_URL, { chollos: new Date('2026-11-04T11:19:00Z') })
    expect(SITEMAP_NAMES).toEqual(['chollos', 'paginas', 'eventos'])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain(
      '<sitemap><loc>https://www.patobarato.com/sitemaps/chollos.xml</loc><lastmod>2026-11-04T11:19:00.000Z</lastmod></sitemap>',
    )
    expect(xml).toContain('<sitemap><loc>https://www.patobarato.com/sitemaps/paginas.xml</loc></sitemap>')
    expect(xml).toContain('<sitemap><loc>https://www.patobarato.com/sitemaps/eventos.xml</loc></sitemap>')
    expect(xml.trim().endsWith('</sitemapindex>')).toBe(true)
  })
})

describe('buildSitemapXml', () => {
  it('writes loc, lastmod in ISO, changefreq and priority', () => {
    const xml = buildSitemapXml([
      { url: 'https://x.test/a', lastModified: new Date('2026-11-04T11:19:00Z'), changeFrequency: 'daily', priority: 0.9 },
      { url: 'https://x.test/b' },
    ])
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain(
      '<url><loc>https://x.test/a</loc><lastmod>2026-11-04T11:19:00.000Z</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>',
    )
    expect(xml).toContain('<url><loc>https://x.test/b</loc></url>')
  })

  it('escapes &, < and > in loc', () => {
    const xml = buildSitemapXml([{ url: 'https://x.test/a?b=1&c=<2>' }])
    expect(xml).toContain('<loc>https://x.test/a?b=1&amp;c=&lt;2&gt;</loc>')
    expect(xml).not.toContain('&c=')
  })

  it('accepts lastModified as a string', () => {
    expect(buildSitemapXml([{ url: 'https://x.test/a', lastModified: '2026-11-04T11:19:00Z' }])).toContain(
      '<lastmod>2026-11-04T11:19:00.000Z</lastmod>',
    )
  })

  it('is an empty urlset without entries', () => {
    expect(buildSitemapXml([])).toMatch(/<urlset[^>]*>\s*<\/urlset>/)
  })
})

describe('dealEntries', () => {
  it('lists every deal with lastmod = publishedAt and changefreq daily', () => {
    expect(dealEntries(deals, SITE_URL)).toEqual([
      { url: 'https://www.patobarato.com/oferta/amazon/freidora-de-aire-b0abcdef12', lastModified: new Date('2026-11-04T11:19:00Z'), changeFrequency: 'daily' },
      { url: 'https://www.patobarato.com/oferta/amazon/cafe-molido-b0zzzzzz99', lastModified: new Date('2026-11-03T08:00:00Z'), changeFrequency: 'daily' },
    ])
  })
})

describe('dealEntries with ended deals', () => {
  it('uses endedAt ?? publishedAt as lastmod', () => {
    const entries = dealEntries(
      [
        { ...deals[0], status: 'ended', endedAt: '2026-11-10T09:00:00Z' },
        { ...deals[1], status: 'active', endedAt: null },
      ],
      SITE_URL,
    )
    expect(entries.map((e) => e.lastModified)).toEqual([new Date('2026-11-10T09:00:00Z'), new Date('2026-11-03T08:00:00Z')])
  })
})

describe('loadSitemapXml', () => {
  it('passes now to fetchAllDealRefs for the chollos sitemap', async () => {
    const client = {} as SupabaseClient
    await loadSitemapXml('chollos', client, NOW)
    expect(fetchAllDealRefs).toHaveBeenCalledWith(client, NOW)
  })
})

describe('pageEntries', () => {
  const base = { siteUrl: SITE_URL, tags: [], stores: [], guides: [], copies: [], now: NOW }
  const urls = (p: Partial<Parameters<typeof pageEntries>[0]>) => pageEntries({ ...base, ...p }).map((e) => e.url)

  it('always lists the home, the listings and the static pages', () => {
    expect(urls({})).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/chollos',
      'https://www.patobarato.com/buscar',
      'https://www.patobarato.com/tiendas',
      'https://www.patobarato.com/cupones',
      'https://www.patobarato.com/guias',
      'https://www.patobarato.com/aviso-legal',
      'https://www.patobarato.com/privacidad',
      'https://www.patobarato.com/cookies',
      'https://www.patobarato.com/afiliados',
      'https://www.patobarato.com/contacto',
      'https://www.patobarato.com/sobre-nosotros',
    ])
  })

  it('lists categories with a published copy or at least 3 deals', () => {
    const u = urls({
      tags: [
        { tag: 'hogar', count: 3 },
        { tag: 'poco', count: 2 },
        { tag: 'uno', count: 1 },
        { tag: 'vacía', count: 0 },
        { tag: 'cañas', count: 10 },
      ],
      copies: [copy('category', 'uno', '2026-11-20T10:00:00Z')],
    })
    expect(u).toContain('https://www.patobarato.com/chollos/hogar')
    expect(u).toContain(`https://www.patobarato.com/chollos/${encodeURIComponent('cañas')}`)
    expect(u).toContain('https://www.patobarato.com/chollos/uno')
    expect(u).not.toContain('https://www.patobarato.com/chollos/poco')
    expect(u.some((x) => x.includes(encodeURIComponent('vacía')))).toBe(false)
  })

  it('lists stores with a published copy or at least 3 deals, never unknown ones', () => {
    const u = urls({
      stores: [
        { store: 'amazon', deals: 10, coupons: 0 },
        { store: 'aliexpress', deals: 2, coupons: 1 },
        { store: 'decathlon', deals: 1, coupons: 0 },
        { store: 'fnac', deals: 9, coupons: 0 },
      ],
      copies: [copy('store', 'aliexpress', '2026-11-20T10:00:00Z'), copy('store', 'fnac', '2026-11-20T10:00:00Z')],
    })
    expect(u).toContain('https://www.patobarato.com/tiendas/amazon')
    expect(u).toContain('https://www.patobarato.com/tiendas/aliexpress')
    expect(u).not.toContain('https://www.patobarato.com/tiendas/decathlon')
    expect(u.some((x) => x.includes('fnac'))).toBe(false)
  })

  it('lists a store with a copy even when it has no deals', () => {
    expect(urls({ copies: [copy('store', 'pccomponentes', '2026-11-20T10:00:00Z')] })).toContain(
      'https://www.patobarato.com/tiendas/pccomponentes',
    )
  })

  it('uses the guide updatedAt and the copies updated_at as lastmod', () => {
    const entries = pageEntries({
      ...base,
      tags: [{ tag: 'hogar', count: 4 }],
      stores: [{ store: 'amazon', deals: 10, coupons: 0 }],
      guides: [guide('cafeteras', '2026-11-07T08:00:00Z')],
      copies: [
        copy('static', 'chollos', '2026-11-21T09:00:00Z'),
        copy('static', 'sobre-nosotros', '2026-11-22T09:00:00Z'),
        copy('category', 'hogar', '2026-11-19T09:00:00Z'),
        copy('store', 'amazon', '2026-11-18T09:00:00Z'),
      ],
    })
    const by = (p: string) => entries.find((e) => e.url === SITE_URL + p)
    expect(by('/guias/cafeteras')?.lastModified).toEqual(new Date('2026-11-07T08:00:00Z'))
    expect(by('/chollos')?.lastModified).toEqual(new Date('2026-11-21T09:00:00Z'))
    expect(by('/sobre-nosotros')?.lastModified).toEqual(new Date('2026-11-22T09:00:00Z'))
    expect(by('/chollos/hogar')?.lastModified).toEqual(new Date('2026-11-19T09:00:00Z'))
    expect(by('/tiendas/amazon')?.lastModified).toEqual(new Date('2026-11-18T09:00:00Z'))
    expect(by('/tiendas')?.lastModified).toBeUndefined()
  })

  it('lists only guides with fresh prices (the others are noindex)', () => {
    const u = urls({
      guides: [
        guide('cafeteras', '2026-11-07T08:00:00Z'),
        guide('freidoras', '2026-11-07T08:00:00Z', '2026-11-19T06:00:00Z'),
        guide('robots', '2026-11-07T08:00:00Z', null),
      ],
    })
    expect(u).toContain(`${SITE_URL}/guias/cafeteras`)
    expect(u).not.toContain(`${SITE_URL}/guias/freidoras`)
    expect(u).not.toContain(`${SITE_URL}/guias/robots`)
  })

  it('lists a guide without products even though it never has prices', () => {
    const u = urls({ guides: [{ ...guide('como-elegir', '2026-11-07T08:00:00Z', null), items: 0 }] })
    expect(u).toContain(`${SITE_URL}/guias/como-elegir`)
  })

  it('has no duplicate URLs', () => {
    const u = urls({
      tags: [{ tag: 'hogar', count: 4 }],
      stores: [{ store: 'amazon', deals: 10, coupons: 0 }],
      copies: [copy('store', 'amazon', '2026-11-18T09:00:00Z')],
    })
    expect(new Set(u).size).toBe(u.length)
  })
})

describe('eventEntries', () => {
  const now = new Date('2026-11-08T10:00:00Z')
  const soon = siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', updatedAt: '2026-11-02T00:00:00Z' })
  const far = siteEvent({ slug: 'navidad', name: 'Navidad', startsOn: '2027-03-01' })
  const during = siteEvent({ slug: 'once', name: '11.11', startsOn: '2026-11-07', endsOn: '2026-11-09' })

  it('lists /eventos and each event with its priority', () => {
    const entries = eventEntries([soon, far, during], SITE_URL, now)
    const by = (u: string) => entries.find((e) => e.url === SITE_URL + u)
    expect(by('/eventos')).toMatchObject({ changeFrequency: 'weekly', priority: 0.7 })
    expect(by('/eventos/black-friday')).toMatchObject({ priority: 0.9, changeFrequency: 'weekly', lastModified: new Date('2026-11-02T00:00:00Z') })
    expect(by('/eventos/navidad')?.priority).toBe(0.6)
    expect(by('/eventos/once')?.priority).toBe(0.9)
  })

  it('keeps /eventos without events (the page is always indexable)', () => {
    expect(eventEntries([], SITE_URL, now).map((e) => e.url)).toEqual(['https://www.patobarato.com/eventos'])
  })
})

describe('buildRobots', () => {
  it('allows everything except /api/ and points to the sitemap index', () => {
    const robots = buildRobots(SITE_URL)
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/'] })
    expect(robots.sitemap).toBe('https://www.patobarato.com/sitemap.xml')
  })
})
