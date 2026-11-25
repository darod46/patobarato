import { ArrowRight, BookOpen } from 'lucide-react'
import { timeAgo } from '../lib/format'
import { guideCover } from '../lib/guide-covers'
import { guidePath } from '../lib/guides'
import type { GuideSummary } from '../lib/types'

type Props = { guide: GuideSummary; now: Date }

/** Home banner pointing to the newest published guide, with its illustrated cover when it has one. */
export function LatestGuideBanner({ guide, now }: Props) {
  const cover = guideCover(guide.slug, guide.title)
  const href = guidePath(guide.slug)
  return (
    <section aria-labelledby="ultima-guia" className="mx-auto max-w-[1200px] px-4 pb-12 md:px-8">
      <div className="relative grid overflow-hidden rounded-3xl border border-warm-line bg-warm md:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3 p-6 md:p-10">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
            <BookOpen size={14} aria-hidden="true" />
            {`Última guía · ${guide.category}`}
          </p>
          <h2 id="ultima-guia" className="font-display text-2xl leading-tight font-bold tracking-[-0.02em] md:text-[32px]">
            {guide.title}
          </h2>
          {guide.subtitle && <p className="text-muted">{guide.subtitle}</p>}
          <p className="text-sm text-muted">{`Publicada ${timeAgo(guide.publishedAt, now)} · ${guide.readingMinutes} min de lectura`}</p>
          <a
            href={href}
            className="mt-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary after:absolute after:inset-0 after:content-['']"
          >
            Leer la guía
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        {cover && (
          <img
            src={cover.url}
            alt=""
            width={cover.width}
            height={cover.height}
            loading="lazy"
            className="h-full w-full object-cover md:max-h-[300px]"
          />
        )}
      </div>
    </section>
  )
}
