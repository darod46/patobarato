'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  /** Current query when the page filters live (listing pages); omit for a plain GET to /chollos. */
  value?: string
  onChange?: (q: string) => void
}

const DEBOUNCE_MS = 300

/**
 * The header search, present on every page. On listing pages it filters live (debounced) through
 * `onChange`; elsewhere it is a plain GET form to `/chollos?q=…`, so it works without JavaScript.
 */
export function HeaderSearch({ value = '', onChange }: Props) {
  const [text, setText] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const onChangeRef = useRef(onChange)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)
  const live = onChange !== undefined

  if (value !== prevValue) {
    setPrevValue(value)
    setText(value)
  }

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  // An external change to value supersedes any pending typed text.
  useEffect(() => {
    clearTimeout(timer.current)
  }, [value])

  const emit = (next: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChangeRef.current?.(next), DEBOUNCE_MS)
  }

  const clear = () => {
    setText('')
    if (live) {
      clearTimeout(timer.current)
      onChangeRef.current?.('')
    }
    input.current?.focus()
  }

  return (
    <form
      role="search"
      action="/chollos"
      method="get"
      className="relative"
      onSubmit={(event) => {
        if (!live) return
        // Live pages already filter as you type: Enter just applies the pending text at once.
        event.preventDefault()
        clearTimeout(timer.current)
        onChangeRef.current?.(text)
      }}
    >
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        type="search"
        name="q"
        value={text}
        placeholder="Buscar chollos…"
        aria-label="Buscar chollos"
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (live) emit(next)
        }}
        className="h-11 w-full rounded-full border border-[#d7dae0] bg-surface pr-11 pl-11 text-[15px] text-ink placeholder:text-muted transition-colors hover:border-muted focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {text !== '' && (
        <button
          type="button"
          onClick={clear}
          aria-label="Borrar búsqueda"
          className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  )
}
