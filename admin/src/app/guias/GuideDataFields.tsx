'use client'

import { fromLocalInput, toLocalInput } from '../../lib/guide-dates'
import type { GuideStatus } from '../../lib/guides'

export type DataFields = {
  title: string
  slug: string
  subtitle: string
  category: string
  author: string
  readingMinutes: string
  status: GuideStatus
}

type Props = {
  value: DataFields
  /** ISO `published_at`; `null` = stamp now on save. */
  publishedAt: string | null
  onPublishedAt: (iso: string | null) => void
  onTitle: (title: string) => void; onSlug: (slug: string) => void; onChange: (patch: Partial<DataFields>) => void
}

const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'

/** «Datos» tab: slug follows the title until the slug is edited by hand. */
export function GuideDataFields({ value, publishedAt, onPublishedAt, onTitle, onSlug, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Título
        <input value={value.title} onChange={(e) => onTitle(e.target.value)} className={INPUT} />
      </label>
      <label className="block text-sm font-medium">
        Slug
        <input value={value.slug} onChange={(e) => onSlug(e.target.value)} className={INPUT} />
      </label>
      <label className="block text-sm font-medium">
        Subtítulo
        <input value={value.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} className={INPUT} />
      </label>
      <label className="block text-sm font-medium">
        Categoría
        <input value={value.category} placeholder="Hogar" onChange={(e) => onChange({ category: e.target.value })} className={INPUT} />
      </label>
      <label className="block text-sm font-medium">
        Autor
        <input value={value.author} onChange={(e) => onChange({ author: e.target.value })} className={INPUT} />
      </label>
      <label className="block text-sm font-medium">
        Minutos de lectura
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={value.readingMinutes}
          onChange={(e) => onChange({ readingMinutes: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="block text-sm font-medium">
        Estado
        <select value={value.status} onChange={(e) => onChange({ status: e.target.value as GuideStatus })} className={INPUT}>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
        </select>
      </label>
      {value.status === 'published' && (
        <div>
          <label className="block text-sm font-medium">
            Fecha de publicación
            <input
              type="datetime-local"
              aria-describedby="published-at-hint"
              value={toLocalInput(publishedAt)}
              onChange={(e) => onPublishedAt(fromLocalInput(e.target.value))}
              className={INPUT}
            />
          </label>
          <p id="published-at-hint" className="mt-1 text-xs text-neutral-600">
            Vacío = ahora al guardar. Una fecha futura programa la guía.
          </p>
        </div>
      )}
    </div>
  )
}
