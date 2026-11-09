'use client'

import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = { label: string; value: string; onChange: (next: string) => void; rows?: number }

/** Markdown textarea with an Editar / Vista previa toggle. Raw HTML is never rendered (no rehype-raw). */
export function MarkdownField({ label, value, onChange, rows = 8 }: Props) {
  const [preview, setPreview] = useState(false)
  const tab = (active: boolean) =>
    `min-h-11 rounded-md border px-4 text-sm ${active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex gap-2" role="group" aria-label={`Modo de ${label}`}>
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>
            Editar
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>
            Vista previa
          </button>
        </div>
      </div>
      {preview ? (
        <div data-testid="markdown-preview" className="prose min-h-24 max-w-none rounded-md border border-neutral-300 p-3 text-sm">
          <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
        </div>
      ) : (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="min-h-11 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
        />
      )}
    </div>
  )
}
