export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-lg font-bold text-carbon">No se han podido cargar los chollos</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-carbon px-4 py-2.5 text-sm font-semibold text-white hover:bg-carbon-soft"
      >
        Reintentar
      </button>
    </div>
  )
}
