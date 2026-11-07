import type { MetadataRoute } from 'next'
import { fetchCoupons } from '../lib/coupons'
import { fetchAllDealRefs, fetchHashtagCounts } from '../lib/deals'
import { fetchGuides } from '../lib/guides-data'
import { buildSitemap } from '../lib/sitemap'
import { fetchStores } from '../lib/stores-data'
import { getSupabase } from '../lib/supabase'
import { SITE_URL } from '../lib/urls'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const client = getSupabase()
    const [deals, tags, coupons, stores, guides] = await Promise.all([
      fetchAllDealRefs(client),
      fetchHashtagCounts(client),
      fetchCoupons(client, 1).catch(() => []),
      fetchStores(client).catch(() => []),
      fetchGuides(client).catch(() => []),
    ])
    return buildSitemap(deals, tags, SITE_URL, { coupons: coupons.length > 0, stores, guides })
  } catch (error) {
    console.error('sitemap: falling back to the home only', error)
    // Never fail the build or the request: the home alone is still a valid sitemap.
    return buildSitemap([], [], SITE_URL)
  }
}
