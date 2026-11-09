'use client'

import type { Spec } from '../../lib/guides'
import { useRowKeys } from '../../lib/useRowKeys'

type Props = { value: Spec[]; onChange: (next: Spec[]) => void }

const SMALL = 'min-h-11 rounded-md border border-neutral-300 px-3 text-sm disabled:opacity-40'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'

/** Label / value rows (e.g. «Capacidad» / «7,6 L») that can be added, removed and moved. */
export function SpecsEditor({ value, onChange }: Props) {
  const rows = useRowKeys(value.length)
  const set = (i: number, patch: Partial<Spec>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  function move(i: number, d: -1 | 1) {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    rows.move(i, d)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Especificaciones</span>
      {value.map((s, i) => (
        <div key={rows.keys[i] ?? i} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-32 flex-1 text-sm font-medium">
            Etiqueta
            <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} className={INPUT} />
          </label>
          <label className="block min-w-32 flex-1 text-sm font-medium">
            Valor
            <input value={s.value} onChange={(e) => set(i, { value: e.target.value })} className={INPUT} />
          </label>
          <button type="button" className={SMALL} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir especificación">
            ↑
          </button>
          <button type="button" className={SMALL} disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Bajar especificación">
            ↓
          </button>
          <button
            type="button"
            className={SMALL}
            aria-label="Quitar especificación"
            onClick={() => {
              rows.remove(i)
              onChange(value.filter((_, j) => j !== i))
            }}
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        className={SMALL}
        onClick={() => {
          rows.add()
          onChange([...value, { label: '', value: '' }])
        }}
      >
        Añadir especificación
      </button>
    </div>
  )
}
