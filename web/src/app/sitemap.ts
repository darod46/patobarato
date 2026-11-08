import type { MetadataRoute } from 'next'
import { fetchCoupons } from '../lib/coupons'
import { fetchAllDealRefs, fetchHashtagCounts } from '../lib/deals'
import { fetchEvents } from '../lib/events-data'
import { fetchGuides } from '../lib/guides-data'
import { buildSitemap } from '../lib/sitemap'
import { fetchStores } from '../lib/stores-data'
import { getSupabase } from '../lib/supabase'
import { SITE_URL } from '../lib/urls'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const client = getSupabase()
    const [deals, tags, coupons, stores, guides, events] = await Promise.all([
      fetchAllDealRefs(client),
      fetchHashtagCounts(client),
      fetchCoupons(client, 1).catch(() => []),
      fetchStores(client).catch(() => []),
      fetchGuides(client).catch(() => []),
      fetchEvents(client).catch(() => []),
    ])
    return buildSitemap(deals, tags, SITE_URL, { coupons: coupons.length > 0, stores, guides, events, now: new Date() })
  } catch (error) {
    console.error('sitemap: deals unavailable —', error instanceof Error ? error.message : error)
    // During the build a minimal sitemap keeps the deploy going. At runtime, failing the
    // regeneration makes Next keep serving the last good sitemap instead of this poor one.
    if (process.env.NEXT_PHASE === 'phase-production-build') return buildSitemap([], [], SITE_URL)
    throw error
  }
}
