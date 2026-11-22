import type { Metadata } from 'next'
import { cache } from 'react'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { PageIntro } from '../../components/PageIntro'
import { defaultH1, fetchPageCopy } from '../../lib/page-copy'
import { aboutJsonLd, breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../lib/seo'
import { primary } from '../../lib/primary'
import { getSupabase } from '../../lib/supabase'
import { SITE_URL } from '../../lib/urls'

export const revalidate = 3600

// Shared by generateMetadata and the page within one request. Primary read: at runtime a failure throws (Next keeps
// the last ISR version); during the build it renders the default h1 and the fallback paragraph.
const loadCopy = cache(async () => (await primary('sobre-nosotros', () => fetchPageCopy(getSupabase(), 'static', 'sobre-nosotros'))) ?? null)

export async function generateMetadata(): Promise<Metadata> {
  return listingMetadata({
    kind: 'static',
    slug: 'sobre-nosotros',
    path: '/sobre-nosotros',
    copy: await loadCopy(),
    values: {},
    indexable: true,
    fallbackDescription: 'Quiénes somos, cómo elegimos los chollos y cómo gana dinero PatoBarato.',
  })
}

export default async function AboutPage() {
  const copy = await loadCopy()
  const jsonLd = [
    breadcrumbJsonLd([
      { name: 'Inicio', path: '/' },
      { name: 'Quiénes somos', path: '/sobre-nosotros' },
    ]),
    ...aboutJsonLd(`${SITE_URL}/sobre-nosotros`),
  ]
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      {jsonLd.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(data)} />
      ))}
      <Header />
      <main className="mx-auto max-w-[800px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <PageIntro h1={copy?.h1 ?? defaultH1('static', 'sobre-nosotros')} copy={copy} values={{}} />
        {!copy && <p className="mt-3 text-muted">PatoBarato es un proyecto independiente de caza de chollos.</p>}
      </main>
      <Footer year={new Date().getUTCFullYear()} />
    </div>
  )
}
