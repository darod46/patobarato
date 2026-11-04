export function DealCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white"
    >
      <div className="aspect-square bg-zinc-100" />
      <div className="flex flex-col gap-2 p-2.5 sm:p-3">
        <div className="h-3.5 w-full rounded bg-zinc-100" />
        <div className="h-3.5 w-2/3 rounded bg-zinc-100" />
        <div className="h-6 w-1/2 rounded bg-zinc-100" />
        <div className="h-10 w-full rounded-lg bg-zinc-100" />
      </div>
    </div>
  )
}
