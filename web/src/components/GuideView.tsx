import { ChevronRight, Lightbulb, Trophy } from 'lucide-react'
import { formatLongDate } from '../lib/format'
import { freshnessLabel, splitSections } from '../lib/guides'
import { GUIDE_COVER_BG, guideCover } from '../lib/guide-covers'
import type { Guide } from '../lib/types'
import { slugify } from '../lib/urls'
import { Footer } from './Footer'
import { Header } from './Header'
import { Markdown } from './Markdown'
import { AffiliateNotice } from './guides/AffiliateNotice'
import { ComparisonTable } from './guides/ComparisonTable'
import { GuideFaq } from './guides/GuideFaq'
import { GuideItemCard } from './guides/GuideItemCard'
import { GuideToc } from './guides/GuideToc'
import { QuickPicks } from './guides/QuickPicks'
import { SectionHeading } from './guides/SectionHeading'
import { TyreFinder } from './guides/TyreFinder'
import { TyreStoreBanner } from './guides/TyreStoreBanner'

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
  const howToChoose = splitSections(guide.howToChooseMd)
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
              {/* Only when some price is on show (Amazon prices may be hidden, lib/flags.ts). */}
              {hasItems && guide.items.some((i) => i.stores.some((s) => s.price !== null)) && (
                <span>{freshnessLabel(guide.pricesCheckedAt, now)}</span>
              )}
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
            {/* The first paragraph reads as a lead. */}
            <Markdown source={guide.introMd} className="[&>p:first-child]:text-lg [&>p:first-child]:leading-relaxed md:[&>p:first-child]:text-xl" />
            {finder && !hasItems && <TyreFinder />}
            {hasItems && (
            <section aria-labelledby="recomendaciones-titulo" className="flex flex-col gap-6">
              <SectionHeading id="recomendaciones-titulo" icon={Trophy}>
                Nuestras recomendaciones
              </SectionHeading>
              {guide.items.map((it, i) => (
                <GuideItemCard key={it.id} item={it} index={i + 1} now={now} />
              ))}
            </section>
            )}
            {hasComparison && <ComparisonTable items={guide.items} />}
            {hasHowToChoose && (
              <section id="como-elegir" aria-labelledby="como-elegir-titulo" className="scroll-mt-24">
                <SectionHeading id="como-elegir-titulo" icon={Lightbulb}>
                  Cómo elegir
                </SectionHeading>
                {howToChoose.lead && <Markdown source={howToChoose.lead} className="mt-5" />}
                {howToChoose.sections.length > 0 && (
                  <ol className="mt-5 flex flex-col gap-3 rounded-3xl border border-warm-line bg-warm p-3 md:p-4">
                    {howToChoose.sections.map((s, i) => (
                      <li key={s.title} className="flex gap-4 rounded-2xl bg-white p-4 md:p-5">
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-ink"
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 id={slugify(s.title)} className="scroll-mt-24 font-display text-lg font-bold">{s.title}</h3>
                          {s.body && <Markdown source={s.body} className="mt-2" />}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
            {finder && <TyreStoreBanner />}
            {hasFaq && <GuideFaq faq={guide.faq} />}
            <AffiliateNotice />
          </div>
        </div>
      </main>
      <Footer year={now.getUTCFullYear()} stores={stores} />
    </div>
  )
}
