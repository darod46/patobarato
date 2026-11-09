'use client'

import { MarkdownField } from '../../components/MarkdownField'
import { StringListEditor } from '../../components/StringListEditor'
import type { GuideItemInput } from '../../lib/guides'
import { useRowKeys } from '../../lib/useRowKeys'
import { SpecsEditor } from './SpecsEditor'
import { StoreLinksEditor } from './StoreLinksEditor'

type Props = { value: GuideItemInput[]; onChange: (next: GuideItemInput[]) => void }

const SMALL = 'min-h-11 rounded-md border border-neutral-300 px-3 text-sm disabled:opacity-40'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'

const EMPTY: GuideItemInput = { name: '', award: '', summaryMd: '', pros: [], cons: [], specs: [], imageUrl: '', stores: [] }

/** Ordered products of a guide: add, remove, move and edit each one with its specs and store links. */
export function GuideItemsEditor({ value, onChange }: Props) {
  const rows = useRowKeys(value.length)
  const set = (i: number, patch: Partial<GuideItemInput>) => onChange(value.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  function move(i: number, d: -1 | 1) {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    rows.move(i, d)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {value.map((it, i) => (
        <fieldset key={rows.keys[i] ?? i} className="space-y-3 rounded-md border border-neutral-300 p-3">
          <legend className="px-1 text-sm font-semibold">{`Producto ${i + 1}`}</legend>
          <label className="block text-sm font-medium">
            Nombre
            <input value={it.name} onChange={(e) => set(i, { name: e.target.value })} className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            Premio
            <input
              value={it.award}
              placeholder="Mejor en general"
              onChange={(e) => set(i, { award: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="block text-sm font-medium">
            Imagen (URL)
            <input type="url" value={it.imageUrl} onChange={(e) => set(i, { imageUrl: e.target.value.trim() })} className={INPUT} />
          </label>
          <MarkdownField label="Resumen" value={it.summaryMd} onChange={(summaryMd) => set(i, { summaryMd })} rows={5} />
          <StringListEditor label="Pros" value={it.pros} onChange={(pros) => set(i, { pros })} />
          <StringListEditor label="Contras" value={it.cons} onChange={(cons) => set(i, { cons })} />
          <SpecsEditor value={it.specs} onChange={(specs) => set(i, { specs })} />
          <StoreLinksEditor value={it.stores} onChange={(stores) => set(i, { stores })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SMALL} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir producto">
              Subir
            </button>
            <button
              type="button"
              className={SMALL}
              disabled={i === value.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Bajar producto"
            >
              Bajar
            </button>
            <button
              type="button"
              className={SMALL}
              aria-label="Quitar producto"
              onClick={() => {
                rows.remove(i)
                onChange(value.filter((_, j) => j !== i))
              }}
            >
              Quitar
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className={SMALL}
        onClick={() => {
          rows.add()
          onChange([...value, { ...EMPTY }])
        }}
      >
        Añadir producto
      </button>
    </div>
  )
}
