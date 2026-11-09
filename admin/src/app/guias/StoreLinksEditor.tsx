'use client'

import { useId } from 'react'
import { formatPrice } from '../../lib/money'
import type { StoreLinkInput } from '../../lib/guides'
import { STORE_IDS } from '../../lib/stores'
import { useRowKeys } from '../../lib/useRowKeys'

type Props = { value: StoreLinkInput[]; onChange: (next: StoreLinkInput[]) => void }

const SMALL = 'min-h-11 rounded-md border border-neutral-300 px-3 text-sm disabled:opacity-40'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'
const EXTERNAL_ID_HELP = 'ASIN en Amazon, id numérico en AliExpress, slug en tiendas Awin'

function PriceLine({ link }: { link: StoreLinkInput }) {
  const p = link.price
  if (!p || p.price === null) return <p className="text-sm text-neutral-600">sin precio todavía</p>
  const checked = p.checkedAt.slice(0, 16).replace('T', ' ')
  return (
    <p className="text-sm text-neutral-700">
      Último precio: {formatPrice(p.price)} {p.currency === 'EUR' ? '€' : p.currency}
      {p.previousPrice !== null ? ` (antes ${formatPrice(p.previousPrice)})` : ''} · {checked} UTC
      {p.error ? ' · el último intento falló' : ''}
    </p>
  )
}

/** Store links of one product. Prices are shown read-only: the bot refreshes them. */
export function StoreLinksEditor({ value, onChange }: Props) {
  const rows = useRowKeys(value.length)
  const listId = useId()
  const set = (i: number, patch: Partial<StoreLinkInput>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">Tiendas</span>
      <datalist id={listId}>
        {STORE_IDS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {value.map((s, i) => (
        <div key={rows.keys[i] ?? i} className="space-y-2 rounded-md border border-neutral-200 p-3">
          <label className="block text-sm font-medium">
            Tienda
            <input value={s.store} list={listId} onChange={(e) => set(i, { store: e.target.value.trim() })} className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            ID externo
            <input
              value={s.externalId}
              aria-describedby={`${listId}-help-${i}`}
              onChange={(e) => set(i, { externalId: e.target.value.trim() })}
              className={INPUT}
            />
          </label>
          <p id={`${listId}-help-${i}`} className="text-xs text-neutral-600">
            {EXTERNAL_ID_HELP}
          </p>
          <label className="block text-sm font-medium">
            URL
            <input type="url" value={s.url} onChange={(e) => set(i, { url: e.target.value.trim() })} className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            Nota
            <input value={s.note} onChange={(e) => set(i, { note: e.target.value })} className={INPUT} />
          </label>
          <PriceLine link={s} />
          <button
            type="button"
            className={SMALL}
            aria-label="Quitar tienda"
            onClick={() => {
              rows.remove(i)
              onChange(value.filter((_, j) => j !== i))
            }}
          >
            Quitar tienda
          </button>
        </div>
      ))}
      <button
        type="button"
        className={SMALL}
        onClick={() => {
          rows.add()
          onChange([...value, { store: '', externalId: '', url: '', note: '', price: null }])
        }}
      >
        Añadir tienda
      </button>
    </div>
  )
}
