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
      className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-carbon placeholder:text-zinc-400 focus:border-amber focus:outline-none"
    />
  )
}
