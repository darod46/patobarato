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
    <div role="group" aria-label="Ordenar" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:self-start md:overflow-visible md:rounded-xl md:bg-surface md:p-1 md:px-1">
      {DEAL_SORTS.map((sort) => {
        const active = sort === value
        return (
          <button
            key={sort}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(sort)}
            className={`min-h-11 whitespace-nowrap rounded-[9px] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              active ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(20,22,26,.08)] max-md:border max-md:border-line' : 'font-medium text-muted hover:text-ink max-md:bg-surface'
            }`}
          >
            {LABELS[sort]}
          </button>
        )
      })}
    </div>
  )
}
