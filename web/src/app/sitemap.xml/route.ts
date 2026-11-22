import { buildSitemapIndex } from '../../lib/sitemap'
import { loadSitemapIndexXml, sitemapResponse } from '../../lib/sitemap-data'
import { SITE_URL } from '../../lib/urls'

export const runtime = 'nodejs'
export const revalidate = 3600

/** Sitemap index (the URL Google already knows), pointing at `/sitemaps/{name}.xml`. */
export function GET(): Promise<Response> {
  return sitemapResponse('sitemap.xml', loadSitemapIndexXml, () => buildSitemapIndex(SITE_URL, {}))
}
