import type { Metadata } from 'next'
import { cache } from 'react'
import { EventCard } from '../../components/events/EventCard'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { PageIntro } from '../../components/PageIntro'
import { eventPhase } from '../../lib/events'
import { fetchEvents } from '../../lib/events-data'
import { optional } from '../../lib/optional'
import { defaultH1, fetchPageCopy } from '../../lib/page-copy'
import { breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'

export const revalidate = 3600

// Shared by generateMetadata and the page within one request. Optional: a failure renders the default h1.
const loadCopy = cache(async () => (await optional('eventos', () => fetchPageCopy(getSupabase(), 'static', 'eventos'))) ?? null)

export async function generateMetadata(): Promise<Metadata> {
  return listingMetadata({
    kind: 'static',
    slug: 'eventos',
    path: '/eventos',
    copy: await loadCopy(),
    values: {},
    indexable: true,
    fallbackDescription: 'El calendario de eventos de compras del año, con sus fechas, los chollos y los cupones de cada uno.',
  })
}

export default async function EventsPage() {
  // The events are the primary read: a failure throws (Next keeps the last ISR version), never an empty page.
  const [events, stores, copy] = await Promise.all([
    fetchEvents(getSupabase()),
    optional('eventos', () => fetchStores(getSupabase())),
    loadCopy(),
  ])
  const now = new Date()
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Eventos', path: '/eventos' },
  ])
  const sections = [
    { title: 'En marcha', items: events.filter((e) => eventPhase(e, now) === 'during') },
    { title: 'Próximos', items: events.filter((e) => eventPhase(e, now) === 'before') },
    {
      title: 'Pasados',
      items: events
        .filter((e) => eventPhase(e, now) === 'after')
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    },
  ].filter((s) => s.items.length > 0)
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <PageIntro h1={copy?.h1 ?? defaultH1('static', 'eventos')} copy={copy} values={{}} />
        {sections.length > 0 ? (
          sections.map((s) => (
            <section key={s.title} className="mt-10">
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{s.title}</h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {s.items.map((e) => (
                  <EventCard key={e.slug} event={e} now={now} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-muted">Todavía no hay eventos en el calendario.</p>
        )}
      </main>
      <Footer year={now.getUTCFullYear()} stores={(stores ?? []).map((s) => s.store)} />
    </div>
  )
}
