export function DealCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-xl border border-line bg-white"
    >
      <div className="aspect-square bg-surface" />
      <div className="flex flex-col gap-2 p-2.5 sm:p-3">
        <div className="h-3.5 w-full rounded bg-surface" />
        <div className="h-3.5 w-2/3 rounded bg-surface" />
        <div className="h-6 w-1/2 rounded bg-surface" />
        <div className="h-10 w-full rounded-lg bg-surface" />
      </div>
    </div>
  )
}
