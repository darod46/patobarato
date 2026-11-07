'use client'

import { Search, X } from 'lucide-react'
import { useRef, type FormEvent } from 'react'

type Props = {
  value: string
  onChange: (q: string) => void
  /** Called on Enter, after `onChange` already holds the text (apply at once). */
  onSubmit?: () => void
  autoFocus?: boolean
}

/** The big search field of `/buscar`: a GET form to `/buscar` (works without JavaScript) that filters live. */
export function SearchField({ value, onChange, onSubmit, autoFocus = false }: Props) {
  const input = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onChange(input.current?.value ?? value)
    onSubmit?.()
  }

  return (
    <form role="search" action="/buscar" method="get" onSubmit={submit} className="relative">
      <Search
        size={22}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
      />
      <input
        ref={input}
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Busca un producto"
        aria-label="Buscar"
        className="h-14 w-full rounded-2xl border border-[#d7dae0] bg-white pr-14 pl-12 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
          className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={20} aria-hidden="true" />
        </button>
      )}
    </form>
  )
}
