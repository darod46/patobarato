import { ArrowRight, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CatalogProduct } from '../../lib/catalog'
import type { Coupon, Deal, EventPhase, SiteEvent } from '../../lib/types'
import { tagPath } from '../../lib/urls'
import { CouponsBlock } from '../CouponsBlock'
import { DealCard } from '../DealCard'
import { Footer } from '../Footer'
import { Header } from '../Header'
import { Markdown } from '../Markdown'
import { GuideFaq } from '../guides/GuideFaq'
import { CatalogBlock } from '../search/CatalogBlock'
import { EventStatusLine } from './EventStatusLine'
import { EventTelegram } from './EventTelegram'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const CONTAINER = 'mx-auto max-w-[1200px] px-4 md:px-8'
const DEAL_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6'
export const MAX_EVENT_DEALS = 12
const PROMOS_NOTE = 'Precios del catálogo de AliExpress con enlace de afiliado; no son chollos verificados por PatoBarato.'

type Props = {
  event: SiteEvent
  phase: EventPhase
  /** The following event, for the status line once this one is over. */
  next: SiteEvent | null
  deals: Deal[]
  coupons: Coupon[]
  promos: CatalogProduct[]
  now: Date
  /** Store ids for the footer's affiliate notice. */
  stores?: string[]
}

/** The page of one shopping event: editorial text plus its deals, coupons and AliExpress promos, ordered by phase. */
export function EventView({ event, phase, next, deals, coupons, promos, now, stores = [] }: Props) {
  const shown = deals.slice(0, MAX_EVENT_DEALS)
  const tag = event.hashtags[0]
  const hasTips = event.tipsMd.trim() !== ''
  const hasIntro = event.introMd.trim() !== ''

  const dealsBlock: ReactNode = shown.length > 0 && (
    <section key="deals" aria-labelledby="chollos-titulo" className={`${CONTAINER} flex w-full flex-col gap-6`}>
      <h2 id="chollos-titulo" className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">
        {phase === 'before' ? 'Chollos relacionados' : `Chollos del ${event.name}`}
      </h2>
      <div className={DEAL_GRID}>
        {shown.map((d) => (
          <DealCard key={d.publicationId} deal={d} now={now} />
        ))}
      </div>
      {tag && (
        <Link
          href={tagPath(tag)}
          className={`inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-primary hover:text-primary-hover ${FOCUS}`}
        >
          Ver todos los chollos
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  )
  const couponsBlock: ReactNode = coupons.length > 0 && <CouponsBlock key="coupons" coupons={coupons} />
  const promosBlock: ReactNode = promos.length > 0 && (
    <div key="promos" className={`${CONTAINER} w-full`}>
      <CatalogBlock
        title={`Selección de AliExpress para el ${event.name}`}
        note={PROMOS_NOTE}
        state={{ status: 'ready', products: promos }}
        onlyWhenResults
      />
    </div>
  )
  const guidance: ReactNode = (hasTips || event.faq.length > 0) && (
    <div key="guidance" className={`${CONTAINER} flex w-full flex-col gap-10`}>
      <div className="flex max-w-[720px] flex-col gap-10">
        {hasTips && (
          <section aria-labelledby="consejos-titulo">
            <h2 id="consejos-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">
              Consejos
            </h2>
            <Markdown source={event.tipsMd} className="mt-4" />
          </section>
        )}
        <GuideFaq faq={event.faq} />
      </div>
    </div>
  )

  const blocks = phase === 'before'
    ? [guidance, dealsBlock, couponsBlock, promosBlock]
    : [dealsBlock, couponsBlock, promosBlock, guidance]

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="flex flex-col gap-12 pt-24 md:pt-32">
        <div className={`${CONTAINER} w-full`}>
          <nav aria-label="Ruta de navegación" className="text-sm text-muted">
            <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className={`inline-flex min-h-11 items-center hover:underline ${FOCUS}`}>
                  Inicio
                </Link>
              </li>
              <li className="flex items-center gap-1.5">
                <ChevronRight size={14} aria-hidden="true" />
                <Link href="/eventos" className={`inline-flex min-h-11 items-center hover:underline ${FOCUS}`}>
                  Eventos
                </Link>
              </li>
              <li className="flex min-w-0 items-center gap-1.5">
                <ChevronRight size={14} aria-hidden="true" />
                <span aria-current="page">{event.name}</span>
              </li>
            </ol>
          </nav>
          <header className="mt-4 max-w-[720px]">
            <h1 className="font-display text-4xl leading-tight font-bold tracking-[-0.03em] md:text-5xl">{event.name}</h1>
            <EventStatusLine event={event} phase={phase} next={next} now={now} />
          </header>
          {hasIntro && <Markdown source={event.introMd} className="mt-8 max-w-[720px]" />}
        </div>
        {blocks}
        <EventTelegram />
      </main>
      <Footer year={now.getUTCFullYear()} stores={stores} />
    </div>
  )
}
