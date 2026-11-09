'use client'

import { useRowKeys } from '../lib/useRowKeys'
import { MarkdownField } from './MarkdownField'

export type FaqItem = { q: string; a_md: string }
type Props = { value: FaqItem[]; onChange: (next: FaqItem[]) => void }

const SMALL = 'min-h-11 rounded-md border border-neutral-300 px-3 text-sm disabled:opacity-40'

export function FaqEditor({ value, onChange }: Props) {
  const set = (i: number, patch: Partial<FaqItem>) => onChange(value.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const rows = useRowKeys(value.length)
  function move(i: number, d: -1 | 1) {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    rows.move(i, d)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">Preguntas frecuentes</span>
      {value.map((it, i) => (
        <div key={rows.keys[i] ?? i} className="space-y-2 rounded-md border border-neutral-200 p-3">
          <label className="block text-sm font-medium">
            Pregunta
            <input
              value={it.q}
              onChange={(e) => set(i, { q: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3"
            />
          </label>
          <MarkdownField label={`Respuesta ${i + 1}`} value={it.a_md} onChange={(a_md) => set(i, { a_md })} rows={4} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SMALL} disabled={i === 0} onClick={() => move(i, -1)}>
              Subir
            </button>
            <button type="button" className={SMALL} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
              Bajar
            </button>
            <button type="button" className={SMALL} onClick={() => {
                rows.remove(i)
                onChange(value.filter((_, j) => j !== i))
              }}>
              Quitar
            </button>
          </div>
        </div>
      ))}
      <button type="button" className={SMALL} onClick={() => {
          rows.add()
          onChange([...value, { q: '', a_md: '' }])
        }}>
        Añadir pregunta
      </button>
    </div>
  )
}
