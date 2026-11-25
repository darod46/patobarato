import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { timeAgo } from '../lib/format'
import { guideCover } from '../lib/guide-covers'
import { guidePath } from '../lib/guides'
import type { GuideSummary } from '../lib/types'

type Props = { guide: GuideSummary; now: Date }

/** A guide counts as new for a week after publication. */
export const NEW_GUIDE_DAYS = 7

/** The illustrations share this cream background, so the card uses it and the drawing blends in uncropped. */
const COVER_BG = '#f9e8bd'

/** Home banner pointing to the newest published guide, with its illustrated cover when it has one. */
export function LatestGuideBanner({ guide, now }: Props) {
  const cover = guideCover(guide.slug, guide.title)
  const href = guidePath(guide.slug)
  const isNew = now.getTime() - new Date(guide.publishedAt).getTime() < NEW_GUIDE_DAYS * 86_400_000
  return (
    <section aria-labelledby="ultima-guia" className="mx-auto max-w-[1200px] px-4 pb-12 md:px-8">
      <div
        className="relative grid overflow-hidden rounded-3xl border border-warm-line md:grid-cols-[minmax(0,1fr)_minmax(340px,46%)] md:min-h-[340px]"
        style={{ backgroundColor: COVER_BG }}
      >
        <div className="order-2 flex flex-col justify-center gap-3 p-6 md:order-1 md:p-12">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wide text-primary uppercase">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={14} aria-hidden="true" />
              {`Última guía · ${guide.category}`}
            </span>
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">
                <Sparkles size={12} aria-hidden="true" />
                Nueva
              </span>
            )}
          </p>
          <h2 id="ultima-guia" className="font-display text-2xl leading-tight font-bold tracking-[-0.02em] md:text-4xl">
            {guide.title}
          </h2>
          {guide.subtitle && <p className="max-w-[52ch] text-muted md:text-lg">{guide.subtitle}</p>}
          <p className="text-sm text-muted">{`Publicada ${timeAgo(guide.publishedAt, now)} · ${guide.readingMinutes} min de lectura`}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={href}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary after:absolute after:inset-0 after:content-['']"
            >
              Leer la guía
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="/guias"
              className="relative z-10 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Todas las guías
            </a>
          </div>
        </div>
        {cover && (
          <img
            src={cover.url}
            alt=""
            width={cover.width}
            height={cover.height}
            loading="lazy"
            className="order-1 aspect-video w-full object-contain md:order-2 md:h-full md:max-h-[380px] md:self-center"
          />
        )}
      </div>
    </section>
  )
}
