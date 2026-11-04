export function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-lg font-bold text-carbon">No hay chollos que coincidan</p>
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg bg-carbon px-4 py-2.5 text-sm font-semibold text-white hover:bg-carbon-soft"
      >
        Quitar filtros
      </button>
    </div>
  )
}
