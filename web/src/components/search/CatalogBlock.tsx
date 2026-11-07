import type { CatalogState } from '../../hooks/useCatalogSearch'
import { DealCardSkeleton } from '../DealCardSkeleton'
import { CatalogCard } from './CatalogCard'

const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6'

type Props = {
  title: string
  note?: string
  state: CatalogState
  maxItems?: number
  /** Render only in `ready` state with at least one product: nothing while loading, on error or when empty. */
  onlyWhenResults?: boolean
}

export function CatalogBlock({ title, note, state, maxItems = 12, onlyWhenResults = false }: Props) {
  if (state.status === 'idle') return null
  const origin = title.replace(/^En /, '')
  const empty = state.status === 'ready' && state.products.length === 0
  if (onlyWhenResults && !(state.status === 'ready' && state.products.length > 0)) return null
  const products = state.status === 'ready' ? state.products.slice(0, maxItems) : []

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {state.status === 'loading' && (
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <DealCardSkeleton key={i} />
          ))}
        </div>
      )}
      {state.status === 'error' && <p className="text-muted">Ahora mismo no podemos buscar en {origin}</p>}
      {empty && <p className="text-muted">No hemos encontrado nada en {origin}</p>}
      {products.length > 0 && (
        <>
          <div className={GRID}>
            {products.map((p) => (
              <CatalogCard key={`${p.origin}:${p.store}:${p.externalId}`} product={p} />
            ))}
          </div>
          <p className="text-xs text-muted">Enlaces de afiliado</p>
        </>
      )}
    </section>
  )
}
