import { isSitemapName, SITEMAP_NAMES } from '../../../lib/sitemap'
import { loadSitemapXml, minimalSitemapXml, sitemapResponse } from '../../../lib/sitemap-data'

export const runtime = 'nodejs'
export const revalidate = 3600

export function generateStaticParams() {
  return SITEMAP_NAMES.map((name) => ({ name: `${name}.xml` }))
}

/** One sitemap, `/sitemaps/{chollos|paginas|eventos}.xml`; anything else is a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const raw = (await params).name
  const name = raw.endsWith('.xml') ? raw.slice(0, -'.xml'.length) : ''
  if (!isSitemapName(name)) return new Response('Not found', { status: 404 })
  const now = new Date()
  return sitemapResponse(`sitemaps/${name}`, (client) => loadSitemapXml(name, client, now), () => minimalSitemapXml(name, now))
}
