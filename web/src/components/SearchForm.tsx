/** Header search outside the home page: a plain GET form to `/?q=…` (no client JavaScript). */
export function SearchForm() {
  return (
    <form action="/" method="get" role="search">
      <input
        type="search"
        name="q"
        placeholder="Buscar chollos…"
        aria-label="Buscar chollos"
        className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-carbon placeholder:text-zinc-500 focus:border-carbon focus:outline-none"
      />
    </form>
  )
}
