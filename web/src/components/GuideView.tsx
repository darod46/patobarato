import { ChevronRight } from 'lucide-react'
import { formatLongDate } from '../lib/format'
import { freshnessLabel } from '../lib/guides'
import type { Guide } from '../lib/types'
import { Footer } from './Footer'
import { Header } from './Header'
import { Markdown } from './Markdown'
import { AffiliateNotice } from './guides/AffiliateNotice'
import { ComparisonTable } from './guides/ComparisonTable'
import { GuideFaq } from './guides/GuideFaq'
import { GuideItemCard } from './guides/GuideItemCard'
import { GuideToc } from './guides/GuideToc'
import { QuickPicks } from './guides/QuickPicks'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Props = {
  guide: Guide
  now: Date
  /** Store ids for the footer's affiliate notice. */
  stores: string[]
}

export function GuideView({ guide, now, stores }: Props) {
  const hasComparison = guide.items.some((it) => it.specs.length > 0)
  const hasHowToChoose = guide.howToChooseMd.trim() !== ''
  const hasFaq = guide.faq.length > 0
  const hasItems = guide.items.length > 0
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header search={null} />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <nav aria-label="Ruta de navegación" className="text-sm text-muted">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
            <li>
              <a href="/" className={`inline-flex min-h-11 items-center hover:underline ${FOCUS}`}>
                Inicio
              </a>
            </li>
            <li className="flex items-center gap-1.5">
              <ChevronRight size={14} aria-hidden="true" />
              <a href="/guias" className={`inline-flex min-h-11 items-center hover:underline ${FOCUS}`}>
                Guías
              </a>
            </li>
            <li className="flex min-w-0 items-center gap-1.5">
              <ChevronRight size={14} aria-hidden="true" />
              <span aria-current="page">{guide.title}</span>
            </li>
          </ol>
        </nav>

        <header className="mt-4 max-w-[720px]">
          <p className="text-xs font-bold tracking-wide text-primary uppercase">{`Guía de compra · ${guide.category}`}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight font-bold tracking-[-0.03em] md:text-5xl">{guide.title}</h1>
          {guide.subtitle && <p className="mt-3 text-lg text-muted">{guide.subtitle}</p>}
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>{`Por ${guide.author} · equipo PatoBarato`}</span>
            <span>{`Actualizado el ${formatLongDate(guide.updatedAt)}`}</span>
            <span>{`${guide.readingMinutes} min de lectura`}</span>
            <span>{freshnessLabel(guide.pricesCheckedAt, now)}</span>
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[260px_minmax(0,720px)] lg:gap-12">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <GuideToc items={guide.items} hasQuickPicks={hasItems} hasComparison={hasComparison} hasHowToChoose={hasHowToChoose} hasFaq={hasFaq} />
          </aside>
          <div className="flex min-w-0 flex-col gap-10">
            {hasItems && <QuickPicks items={guide.items} now={now} />}
            <AffiliateNotice />
            <Markdown source={guide.introMd} />
            {hasItems && (
            <section aria-labelledby="recomendaciones-titulo" className="flex flex-col gap-6">
              <h2 id="recomendaciones-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">
                Nuestras recomendaciones
              </h2>
              {guide.items.map((it, i) => (
                <GuideItemCard key={it.id} item={it} index={i + 1} now={now} />
              ))}
            </section>
            )}
            {hasComparison && <ComparisonTable items={guide.items} />}
            {hasHowToChoose && (
              <section id="como-elegir" aria-labelledby="como-elegir-titulo" className="scroll-mt-24">
                <h2 id="como-elegir-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">
                  Cómo elegir
                </h2>
                <Markdown source={guide.howToChooseMd} className="mt-4" />
              </section>
            )}
            {hasFaq && <GuideFaq faq={guide.faq} />}
            <AffiliateNotice />
          </div>
        </div>
      </main>
      <Footer year={now.getUTCFullYear()} stores={stores} />
    </div>
  )
}
