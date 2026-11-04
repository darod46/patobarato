export function DealCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white"
    >
      <div className="aspect-square bg-zinc-100" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-full rounded bg-zinc-100" />
        <div className="h-4 w-2/3 rounded bg-zinc-100" />
        <div className="h-8 w-1/3 rounded bg-zinc-100" />
        <div className="h-10 w-full rounded-lg bg-zinc-100" />
      </div>
    </div>
  )
}
