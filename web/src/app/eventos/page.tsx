import type { Metadata } from 'next'
import { EmptyState } from '../../components/EmptyState'
import { EventCard } from '../../components/events/EventCard'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { eventPhase } from '../../lib/events'
import { fetchEvents } from '../../lib/events-data'
import { optional } from '../../lib/optional'
import { breadcrumbJsonLd, eventsMetadata, jsonLdScript } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'

export const revalidate = 3600

export function generateMetadata(): Metadata {
  return eventsMetadata()
}

export default async function EventsPage() {
  const [events, stores] = await Promise.all([
    optional('eventos', () => fetchEvents(getSupabase())),
    optional('eventos', () => fetchStores(getSupabase())),
  ])
  const now = new Date()
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Eventos', path: '/eventos' },
  ])
  const sections = events
    ? [
        { title: 'En marcha', items: events.filter((e) => eventPhase(e, now) === 'during') },
        { title: 'Próximos', items: events.filter((e) => eventPhase(e, now) === 'before') },
        {
          title: 'Pasados',
          items: events
            .filter((e) => eventPhase(e, now) === 'after')
            .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
        },
      ].filter((s) => s.items.length > 0)
    : []
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">Eventos de compras</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Las fechas clave del año para comprar más barato: qué son, cuándo caen y los chollos y cupones que encontramos
          en cada una.
        </p>
        {events ? (
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
          <EmptyState message="Ahora mismo no podemos cargar el calendario. Vuelve en un rato." />
        )}
      </main>
      <Footer year={now.getUTCFullYear()} stores={(stores ?? []).map((s) => s.store)} />
    </div>
  )
}
