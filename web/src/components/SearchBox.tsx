import { useEffect, useRef, useState } from 'react'

type Props = { value: string; onChange: (q: string) => void }

export function SearchBox({ value, onChange }: Props) {
  const [text, setText] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const onChangeRef = useRef(onChange)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  return (
    <input
      type="search"
      value={text}
      placeholder="Buscar chollos…"
      aria-label="Buscar chollos"
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onChangeRef.current(next), 300)
      }}
      className="w-full rounded-lg border border-line bg-white px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
    />
  )
}
