import { BookOpen } from 'lucide-react'
import { formatLongDate } from '../lib/format'
import { guideCover } from '../lib/guide-covers'
import { guidePath } from '../lib/guides'
import { countLabel } from '../lib/text'
import type { GuideSummary } from '../lib/types'

export function GuideCard({ guide }: { guide: GuideSummary }) {
  const cover = guideCover(guide.slug, guide.title)
  return (
    <article className="relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-line bg-white p-5 focus-within:border-primary hover:border-primary">
      {cover && (
        <img
          src={cover.url}
          alt=""
          width={cover.width}
          height={cover.height}
          loading="lazy"
          className="-mx-5 -mt-5 mb-2 aspect-video w-[calc(100%+2.5rem)] max-w-none object-cover"
        />
      )}
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
        <BookOpen size={14} aria-hidden="true" />
        {guide.category}
      </p>
      <h2 className="font-display text-xl leading-snug font-bold tracking-[-0.02em]">
        <a
          href={guidePath(guide.slug)}
          className="inline-flex min-h-11 items-center after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {guide.title}
        </a>
      </h2>
      {guide.subtitle && <p className="text-muted">{guide.subtitle}</p>}
      <p className="mt-auto pt-2 text-sm text-muted">
        {countLabel(guide.items, 'producto', 'productos')} · actualizada el {formatLongDate(guide.updatedAt)}
      </p>
    </article>
  )
}
