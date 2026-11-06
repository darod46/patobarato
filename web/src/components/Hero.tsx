const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Facts taken from the current listing; a null/false value hides its badge. */
export type HeroHighlights = {
  topDiscountPct: number | null
  topDiscountTitle: string | null
  latestCouponTitle: string | null
  hasLowest: boolean
}

const CHECK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

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

export function Hero({ highlights }: { highlights: HeroHighlights }) {
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
            El pato que caza los chollos de Amazon antes de que vuelen
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Vigilo canales de chollos de Telegram y publico cada oferta de Amazon España con su precio,
            el precio anterior y el cupón si lo hay. Sin registros ni spam.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="/#chollos"
              className={`inline-flex h-13 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-white hover:bg-primary-hover ${FOCUS}`}
            >
              Ver chollos de hoy
            </a>
            <a
              href="https://t.me/patobarato"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-[#d7dae0] bg-white px-6 text-base font-semibold text-ink hover:bg-surface ${FOCUS}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 3 2 11l7 3 3 7 10-18Z" />
                <path d="m9 14 13-11" />
              </svg>
              Recibirlos en Telegram
            </a>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {GUARANTEES.map((text) => (
              <li key={text} className="flex items-center gap-2">
                <span className="text-success">{CHECK}</span>
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
              <span className="text-success">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3 17 6-6 4 4 8-8" />
                </svg>
              </span>
              Mínimo histórico
            </Badge>
          )}
        </div>
      </div>
    </section>
  )
}
