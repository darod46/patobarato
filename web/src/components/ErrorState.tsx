import { RefreshCw } from 'lucide-react'

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="font-display text-xl font-bold text-ink">No se han podido cargar los chollos</p>
      <p className="max-w-sm text-sm text-muted">Puede ser algo pasajero. Vuelve a intentarlo en un momento.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <RefreshCw size={16} aria-hidden="true" />
        Reintentar
      </button>
    </div>
  )
}
