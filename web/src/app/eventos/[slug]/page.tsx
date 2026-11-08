import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { EventView, MAX_EVENT_DEALS } from '../../../components/events/EventView'
import { fetchCoupons } from '../../../lib/coupons'
import { fetchDeals } from '../../../lib/deals'
import { eventPath, eventPhase, madridDay, nextEvent } from '../../../lib/events'
import { fetchEvent, fetchEventPromos, fetchEvents } from '../../../lib/events-data'
import { optional } from '../../../lib/optional'
import { breadcrumbJsonLd, eventJsonLd, eventMetadata, faqJsonLd, jsonLdScript } from '../../../lib/seo'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'
import { SITE_URL } from '../../../lib/urls'

export const revalidate = 3600

// Events published after the build are rendered (and cached) on first request.
export const dynamicParams = true

export async function generateStaticParams() {
  const events = await Promise.resolve()
    .then(() => fetchEvents(getSupabase()))
    .catch((e: unknown) => {
      console.error('events: static params unavailable —', e instanceof Error ? e.message : e)
      return []
    })
  return events.map((e) => ({ slug: e.slug }))
}

type Props = { params: Promise<{ slug: string }> }

// Shared by generateMetadata and the page within one request. Null means 404 (unknown or unpublished slug).
// A failed lookup is NOT a 404: it propagates so Next keeps serving the last good ISR version (spec §6.4).
const loadEvent = cache(async (slug: string) => fetchEvent(getSupabase(), slug))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await loadEvent((await params).slug)
  if (!event) notFound()
  return eventMetadata(event)
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params
  const event = await loadEvent(slug)
  if (!event) notFound()
  const now = new Date()
  const phase = eventPhase(event, now)
  const label = `evento/${slug}`
  // Before the event the dates are in the future: show the stores' deals from the last 7 days instead.
  const recent = phase === 'before' && event.stores.length > 0
  const from = recent ? madridDay(now, -7) : event.startsOn
  const to = recent ? madridDay(now) : event.endsOn
  // Each block degrades on its own: a failed loader omits its section, the editorial page still renders.
  const [page, coupons, promos, stores, events] = await Promise.all([
    optional(`${label}/chollos`, () =>
      fetchDeals(getSupabase(), {
        page: 0,
        event: { hashtags: event.hashtags, stores: event.stores, from, to },
      }),
    ),
    optional(`${label}/cupones`, () => fetchCoupons(getSupabase(), undefined, undefined, event.id)),
    optional(`${label}/promos`, () => fetchEventPromos(getSupabase(), slug)),
    optional(`${label}/tiendas`, () => fetchStores(getSupabase())),
    phase === 'after' ? optional(`${label}/eventos`, () => fetchEvents(getSupabase())) : undefined,
  ])
  const next = phase === 'after' && events ? nextEvent(now, events.filter((e) => e.slug !== slug)) : null
  const path = eventPath(event.slug)
  const jsonLd = [
    breadcrumbJsonLd([
      { name: 'Inicio', path: '/' },
      { name: 'Eventos', path: '/eventos' },
      { name: event.name, path },
    ]),
    eventJsonLd(event, SITE_URL + path),
    event.faq.length > 0 ? faqJsonLd(event.faq) : null,
  ].filter((d) => d !== null)
  return (
    <>
      {jsonLd.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(data)} />
      ))}
      <EventView
        event={event}
        phase={phase}
        next={next}
        deals={(page?.deals ?? []).slice(0, MAX_EVENT_DEALS)}
        coupons={coupons ?? []}
        promos={promos ?? []}
        now={now}
        stores={(stores ?? []).map((s) => s.store)}
      />
    </>
  )
}
