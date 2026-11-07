/** Header search outside the home page: a plain GET form to `/?q=…` (no client JavaScript). */
export function SearchForm() {
  return (
    <form action="/" method="get" role="search">
      <input
        type="search"
        name="q"
        placeholder="Buscar chollos…"
        aria-label="Buscar chollos"
        className="min-h-11 w-full rounded-lg border border-line bg-white px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />
    </form>
  )
}
