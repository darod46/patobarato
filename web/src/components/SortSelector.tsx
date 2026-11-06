import { DEAL_SORTS, type DealSort } from '../lib/deals'

const LABELS: Record<DealSort, string> = {
  recientes: 'Más recientes',
  descuento: 'Mayor descuento',
  minimo: 'Mínimo histórico',
}

type Props = { value: DealSort; onChange: (sort: DealSort) => void }

/** Segmented control for the listing order. */
export function SortSelector({ value, onChange }: Props) {
  return (
    <div role="group" aria-label="Ordenar" className="flex gap-1 self-start rounded-xl bg-surface p-1">
      {DEAL_SORTS.map((sort) => {
        const active = sort === value
        return (
          <button
            key={sort}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(sort)}
            className={`min-h-10 whitespace-nowrap rounded-[9px] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              active ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(20,22,26,.08)]' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            {LABELS[sort]}
          </button>
        )
      })}
    </div>
  )
}
