import { Check, Send, TrendingDown, Zap } from 'lucide-react'
import { eventPath } from '../lib/events'
import { joinNames } from '../lib/text'
import type { SiteEvent } from '../lib/types'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Facts taken from the current listing; a null/false value hides its badge. */
export type HeroHighlights = {
  topDiscountPct: number | null
  topDiscountTitle: string | null
  latestCouponTitle: string | null
  hasLowest: boolean
}

const GUARANTEES = ['Precio comprobado', 'Cupón incluido cuando existe', 'Gratis, sin cuenta']

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      data-testid="hero-badge"
      className={`absolute flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-medium shadow-[0_8px_24px_rgba(20,22,26,.08)] ${className}`}
    >
      {children}
    </div>
  )
}

type Props = {
  highlights: HeroHighlights
  storeNames: string[]
  /** Event in progress: the primary button then leads to its page. */
  activeEvent?: SiteEvent | null
}

export function Hero({ highlights, storeNames, activeEvent = null }: Props) {
  const { topDiscountPct, topDiscountTitle, latestCouponTitle, hasLowest } = highlights
  return (
    <section className="bg-gradient-to-b from-warm to-white">
      <div className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 py-8 md:grid-cols-[6fr_5fr] md:gap-12 md:px-8 md:py-16">
        <div className="order-2 flex flex-col items-center gap-5 text-center md:order-1 md:items-start md:gap-6 md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-warm-line bg-white px-3 py-1.5 text-[13px] font-semibold text-accent-ink">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            Vigilante de precios · Ofertas que vuelan
          </span>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl">
            El pato que caza los chollos antes de que vuelen
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted md:text-lg">
            {joinNames(storeNames.length > 0 ? storeNames : ['Amazon'])}. Cada oferta con su precio, el precio anterior y el
            cupón si lo hay. Sin registros ni spam.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href={activeEvent ? eventPath(activeEvent.slug) : '/#chollos'}
              className={`inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-white hover:bg-primary-hover ${FOCUS}`}
            >
              {activeEvent && <Zap size={18} aria-hidden="true" />}
              {activeEvent ? `Chollos del ${activeEvent.name}` : 'Ver chollos de hoy'}
            </a>
            <a
              href="https://t.me/patobarato"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-[#d7dae0] bg-white px-6 text-base font-semibold text-ink hover:bg-surface ${FOCUS}`}
            >
              <Send size={18} aria-hidden="true" />
              Recibirlos en Telegram
            </a>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {GUARANTEES.map((text) => (
              <li key={text} className="flex items-center gap-2">
                <Check size={18} className="text-success" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative order-1 flex min-h-[240px] items-center justify-center md:order-2 md:min-h-[460px]">
          <div className="absolute h-[220px] w-[220px] rounded-full bg-accent opacity-35 md:h-[400px] md:w-[400px]" aria-hidden="true" />
          <div className="absolute h-[160px] w-[160px] rounded-full bg-accent opacity-55 md:h-[300px] md:w-[300px]" aria-hidden="true" />
          <img
            src="/pato-heroe.svg"
            alt="Mascota de PatoBarato, un pato superhéroe"
            width={360}
            height={360}
            className="relative h-[200px] w-[200px] object-contain md:h-[360px] md:w-[360px]"
          />
          {topDiscountPct !== null && topDiscountTitle && (
            <Badge className="left-0 top-2 md:top-9">
              <span className="rounded-lg bg-danger px-2 py-0.5 text-[13px] font-bold text-white">-{topDiscountPct}%</span>
              <span className="max-w-[160px] truncate">{topDiscountTitle}</span>
            </Badge>
          )}
          {latestCouponTitle && (
            <Badge className="bottom-6 right-0 md:bottom-12">
              <span className="rounded-lg bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">Cupón</span>
              <span className="max-w-[160px] truncate">{latestCouponTitle}</span>
            </Badge>
          )}
          {hasLowest && (
            <Badge className="bottom-0 left-4 md:bottom-2 md:left-6">
              <TrendingDown size={16} className="text-success" aria-hidden="true" />
              Mínimo histórico
            </Badge>
          )}
        </div>
      </div>
    </section>
  )
}
