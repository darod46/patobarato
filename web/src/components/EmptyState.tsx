import { SearchX } from 'lucide-react'

export function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <SearchX size={40} className="text-muted" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">No hay chollos con esos filtros</p>
      <p className="max-w-sm text-sm text-muted">Prueba con otra búsqueda o quita los filtros para ver todos los chollos de hoy.</p>
      <button
        type="button"
        onClick={onClear}
        className="h-12 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Quitar filtros
      </button>
    </div>
  )
}
