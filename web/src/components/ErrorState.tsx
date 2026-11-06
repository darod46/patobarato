export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-lg font-bold text-ink">No se han podido cargar los chollos</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2b3039]"
      >
        Reintentar
      </button>
    </div>
  )
}
