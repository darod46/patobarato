import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { product } from '../search/fixtures'
import { siteEvent } from '../../test-utils/siteEvent'
import type { Coupon, Deal, EventPhase, SiteEvent } from '../../lib/types'
import type { CatalogProduct } from '../../lib/catalog'
import { EventView } from './EventView'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => { throw new Error('no env') } }))

const now = new Date('2026-11-28T10:00:00Z')
const deal = (id: number): Deal => ({
  publicationId: id, publishedAt: '2026-11-28T09:00:00Z', price: 10, previousPrice: null, coupon: null,
  hashtags: ['blackfriday'], affiliateUrl: 'https://amzn.to/x', title: `Chollo ${id}`, imageUrl: null,
  asin: `A${id}`, country: 'es', store: 'amazon', productId: id, discountPct: null, previousMinPrice: null, isLowest: false,
})
const coupon = (id: number): Coupon => ({
  id, store: 'aliexpress', code: `C${id}`, title: `Cupón ${id}`, conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z',
  expiresAt: null, discountAmount: null, discountPct: null, minPurchase: null, eventId: 1,
})
const full = siteEvent({
  slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', hashtags: ['blackfriday', 'bf'],
  introMd: 'El **Black Friday** es el viernes de descuentos.', tipsMd: 'Compara precios antes.',
  faq: [{ q: '¿Cuándo es?', aMd: 'El último viernes de noviembre.' }],
})

type Over = Partial<{ event: SiteEvent; phase: EventPhase; deals: Deal[]; coupons: Coupon[]; promos: CatalogProduct[] }>
const view = (o: Over = {}) =>
  render(
    <EventView
      event={o.event ?? full}
      phase={o.phase ?? 'during'}
      next={null}
      deals={o.deals ?? [deal(1), deal(2)]}
      coupons={o.coupons ?? [coupon(1)]}
      promos={o.promos ?? [product({ origin: 'aliexpress', store: 'aliexpress', title: 'Auriculares' })]}
      now={now}
    />,
  )

const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('EventView', () => {
  it('during: status, intro, deals, coupons, promos, tips, FAQ, Telegram in that order', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Black Friday' })).toBeInTheDocument()
    expect(screen.getByText('En marcha hasta el 29 de noviembre')).toBeInTheDocument()
    expect(h2s()).toEqual([
      'Chollos del Black Friday',
      'Cupones de AliExpress',
      'Selección de AliExpress para el Black Friday',
      'Consejos',
      'Preguntas frecuentes',
      'Recibe los chollos al momento en Telegram',
    ])
    expect(screen.getByText('Precios del catálogo de AliExpress con enlace de afiliado; no son chollos verificados por PatoBarato.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todos los chollos' })).toHaveAttribute('href', '/chollos/blackfriday')
  })

  it('before: tips and FAQ come before the deals, titled as related', () => {
    view({ phase: 'before' })
    expect(h2s()).toEqual([
      'Consejos',
      'Preguntas frecuentes',
      'Chollos relacionados',
      'Cupones de AliExpress',
      'Selección de AliExpress para el Black Friday',
      'Recibe los chollos al momento en Telegram',
    ])
  })

  it('does not repeat AliExpress in the promos heading when the event name already says it', () => {
    view({ event: { ...full, name: '11.11 de AliExpress' } })
    expect(screen.getByRole('heading', { level: 2, name: 'Selección de AliExpress' })).toBeInTheDocument()
    expect(screen.queryByText(/para el 11\.11/)).toBeNull()
  })

  it('shows at most 12 deals', () => {
    view({ deals: Array.from({ length: 15 }, (_, i) => deal(i + 1)) })
    const section = screen.getByRole('heading', { level: 2, name: 'Chollos del Black Friday' }).closest('section')!
    expect(within(section).getAllByText(/^Chollo \d+$/)).toHaveLength(12)
  })

  it('omits every empty section and the all-deals link', () => {
    view({ event: { ...full, tipsMd: '  ', faq: [], introMd: '' }, deals: [], coupons: [], promos: [] })
    expect(h2s()).toEqual(['Recibe los chollos al momento en Telegram'])
    expect(screen.queryByRole('link', { name: 'Ver todos los chollos' })).not.toBeInTheDocument()
  })

  it('has no all-deals link when the event has no hashtags', () => {
    view({ event: { ...full, hashtags: [] } })
    expect(screen.getByRole('heading', { level: 2, name: 'Chollos del Black Friday' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ver todos los chollos' })).not.toBeInTheDocument()
  })

  it('has breadcrumbs back to the events index', () => {
    view()
    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(nav).getByRole('link', { name: 'Eventos' })).toHaveAttribute('href', '/eventos')
    expect(within(nav).getByText('Black Friday')).toHaveAttribute('aria-current', 'page')
  })
})
