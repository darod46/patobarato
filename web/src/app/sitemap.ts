import type { MetadataRoute } from 'next'
import { fetchAllDealRefs, fetchHashtagCounts } from '../lib/deals'
import { buildSitemap } from '../lib/sitemap'
import { getSupabase } from '../lib/supabase'
import { SITE_URL } from '../lib/urls'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const client = getSupabase()
    const [deals, tags] = await Promise.all([fetchAllDealRefs(client), fetchHashtagCounts(client)])
    return buildSitemap(deals, tags, SITE_URL)
  } catch (error) {
    console.error('sitemap: falling back to the home only', error)
    // Never fail the build or the request: the home alone is still a valid sitemap.
    return buildSitemap([], [], SITE_URL)
  }
}
