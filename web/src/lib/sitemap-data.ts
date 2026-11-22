import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllDealRefs, fetchHashtagCounts, fetchLatestDeal } from './deals'
import { fetchEvents } from './events-data'
import { fetchGuides } from './guides-data'
import { fetchPageCopies } from './page-copy'
import { buildSitemapIndex, buildSitemapXml, dealEntries, eventEntries, latest, pageEntries, type SitemapName } from './sitemap'
import { fetchStores } from './stores-data'
import { getSupabase } from './supabase'
import { SITE_URL } from './urls'

export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}

async function fetchAllCopies(client: SupabaseClient) {
  const kinds = await Promise.all((['static', 'category', 'store'] as const).map((kind) => fetchPageCopies(client, kind)))
  return kinds.flat()
}

/** XML of one sitemap. Every read is primary: a failure throws. */
export async function loadSitemapXml(name: SitemapName, client: SupabaseClient, now: Date): Promise<string> {
  if (name === 'chollos') return buildSitemapXml(dealEntries(await fetchAllDealRefs(client), SITE_URL))
  if (name === 'eventos') return buildSitemapXml(eventEntries(await fetchEvents(client), SITE_URL, now))
  const [tags, stores, guides, copies] = await Promise.all([
    fetchHashtagCounts(client),
    fetchStores(client),
    fetchGuides(client),
    fetchAllCopies(client),
  ])
  return buildSitemapXml(pageEntries({ siteUrl: SITE_URL, tags, stores, guides, copies }))
}

/** Minimal sitemap used only when the reads fail during the build. */
export function minimalSitemapXml(name: SitemapName, now: Date): string {
  if (name === 'chollos') return buildSitemapXml([])
  if (name === 'eventos') return buildSitemapXml(eventEntries([], SITE_URL, now))
  return buildSitemapXml(pageEntries({ siteUrl: SITE_URL, tags: [], stores: [], guides: [], copies: [] }))
}

/** XML of the sitemap index, with each sitemap's lastmod from its newest row. */
export async function loadSitemapIndexXml(client: SupabaseClient): Promise<string> {
  const [deal, guides, copies, events] = await Promise.all([
    fetchLatestDeal(client),
    fetchGuides(client),
    fetchAllCopies(client),
    fetchEvents(client),
  ])
  return buildSitemapIndex(SITE_URL, {
    chollos: latest([deal?.publishedAt]),
    paginas: latest([...guides.map((g) => g.updatedAt), ...copies.map((c) => c.updatedAt)]),
    eventos: latest(events.map((e) => e.updatedAt)),
  })
}

/**
 * Serves a sitemap file. During the build a failed read yields `fallback()` so the deploy goes on;
 * at runtime it throws, so Next keeps serving the last good version instead of a poor one.
 */
export async function sitemapResponse(label: string, load: (client: SupabaseClient) => Promise<string>, fallback: () => string): Promise<Response> {
  let xml: string
  try {
    xml = await load(getSupabase())
  } catch (error) {
    console.error(`${label}: data unavailable —`, error instanceof Error ? error.message : error)
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw error
    xml = fallback()
  }
  return new Response(xml, { headers: SITEMAP_HEADERS })
}
