import { Search } from 'lucide-react'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * Header search. On `md+` a real field: typing and pressing Enter submits a plain GET form to
 * `/buscar?q=…` (works without JavaScript). Below `md` there is no room for a field, so it is a
 * round 44 px link to `/buscar`, where the search field gets the focus.
 */
export function SearchTrigger() {
  return (
    <>
      <a
        href="/buscar"
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface md:hidden ${FOCUS}`}
      >
        <Search size={22} aria-hidden="true" />
        <span className="sr-only">Buscar chollos</span>
      </a>
      <form action="/buscar" method="get" role="search" aria-label="Buscar chollos" className="hidden w-full max-w-[300px] min-w-[200px] md:block">
        <label className="group relative flex items-center">
          <span className="sr-only">Buscar chollos</span>
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 text-muted transition-colors group-focus-within:text-primary"
          />
          <input
            type="search"
            name="q"
            placeholder="Buscar chollos…"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted transition-colors hover:border-[#c9cdd4] focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </form>
    </>
  )
}
