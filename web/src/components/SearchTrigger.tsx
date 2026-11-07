import { Search } from 'lucide-react'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Header entry to `/buscar`: a pill on `md+`, a round 44 px icon below. A plain link, so it works without JavaScript. */
export function SearchTrigger() {
  return (
    <a
      href="/buscar"
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface md:size-auto md:h-11 md:w-full md:max-w-[320px] md:min-w-[200px] md:justify-start md:gap-2 md:border md:border-[#d7dae0] md:bg-surface md:px-4 md:hover:border-muted ${FOCUS}`}
    >
      <Search size={22} aria-hidden="true" className="md:size-[18px] md:text-muted" />
      <span className="hidden text-[15px] text-muted md:inline">Buscar chollos…</span>
      <span className="sr-only md:hidden">Buscar chollos</span>
    </a>
  )
}
