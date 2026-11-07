import type { Metadata } from 'next'
import { Footer } from '../../components/Footer'
import { GuideCard } from '../../components/GuideCard'
import { Header } from '../../components/Header'
import { fetchGuides } from '../../lib/guides-data'
import { breadcrumbJsonLd, guidesMetadata, jsonLdScript } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { optional } from '../../lib/optional'

// Regenerated at most every 60 s, like the listings.
export const revalidate = 60


export async function generateMetadata(): Promise<Metadata> {
  const guides = await optional('guias', () => fetchGuides(getSupabase()))
  return guidesMetadata(guides?.length ?? 0)
}

export default async function GuidesPage() {
  const [guides, stores] = await Promise.all([
    optional('guias', () => fetchGuides(getSupabase())),
    optional('guias', () => fetchStores(getSupabase())),
  ])
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Guías', path: '/guias' },
  ])
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header search={null} />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">Guías de compra</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Comparativas con los mejores productos de cada categoría, sus precios revisados y los cupones que aplican.
        </p>
        {guides && guides.length > 0 ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {guides.map((g) => (
              <li key={g.slug}>
                <GuideCard guide={g} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">Todavía no hay guías publicadas</p>
        )}
      </main>
      <Footer year={new Date().getUTCFullYear()} stores={(stores ?? []).map((s) => s.store)} />
    </div>
  )
}
