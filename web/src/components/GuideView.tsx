import { ChevronRight } from 'lucide-react'
import { formatLongDate } from '../lib/format'
import { freshnessLabel } from '../lib/guides'
import { GUIDE_COVER_BG, guideCover } from '../lib/guide-covers'
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
import { TyreFinder } from './guides/TyreFinder'

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
  const cover = guideCover(guide.slug, guide.title)
  const hasItems = guide.items.length > 0
  const finder = guide.widget === 'neumaticos'
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
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

        <header
          className={
            cover
              ? 'mt-4 grid overflow-hidden rounded-3xl border border-warm-line md:grid-cols-[minmax(0,1fr)_minmax(380px,55%)]'
              : 'mt-4 max-w-[720px]'
          }
          style={cover ? { backgroundColor: GUIDE_COVER_BG } : undefined}
        >
          <div className={cover ? 'order-2 flex flex-col justify-center gap-3 p-6 md:order-1 md:p-10' : ''}>
            <p className="text-xs font-bold tracking-wide text-primary uppercase">{`Guía de compra · ${guide.category}`}</p>
            <h1
              className={`font-display leading-tight font-bold tracking-[-0.03em] ${cover ? 'text-2xl md:text-[34px]' : 'mt-2 text-3xl md:text-5xl'}`}
            >
              {guide.title}
            </h1>
            {guide.subtitle && <p className={`text-lg text-muted ${cover ? 'max-w-[52ch]' : 'mt-3'}`}>{guide.subtitle}</p>}
            <p className={`flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted ${cover ? '' : 'mt-4'}`}>
              <span>{`Por ${guide.author} · equipo PatoBarato`}</span>
              <span>{`Actualizado el ${formatLongDate(guide.updatedAt)}`}</span>
              <span>{`${guide.readingMinutes} min de lectura`}</span>
              {hasItems && <span>{freshnessLabel(guide.pricesCheckedAt, now)}</span>}
            </p>
          </div>
          {cover && (
            <img
              src={cover.url}
              alt={cover.alt}
              width={cover.width}
              height={cover.height}
              fetchPriority="high"
              className="order-1 aspect-video w-full object-cover md:order-2 md:h-full"
            />
          )}
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[260px_minmax(0,720px)] lg:gap-12">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <GuideToc items={guide.items} hasQuickPicks={hasItems} hasComparison={hasComparison} hasHowToChoose={hasHowToChoose} hasFaq={hasFaq} />
          </aside>
          <div className="flex min-w-0 flex-col gap-10">
            {hasItems && <QuickPicks items={guide.items} now={now} />}
            {finder && hasItems && <TyreFinder />}
            <AffiliateNotice />
            <Markdown source={guide.introMd} />
            {finder && !hasItems && <TyreFinder />}
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
            {finder && <TyreFinder />}
            {hasFaq && <GuideFaq faq={guide.faq} />}
            <AffiliateNotice />
          </div>
        </div>
      </main>
      <Footer year={now.getUTCFullYear()} stores={stores} />
    </div>
  )
}
