'use client'

import { useId, useState } from 'react'

type Props = {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  /** Removes leading `#` characters from added items (hashtags). */
  stripHash?: boolean
}

export function StringListEditor({ label, value, onChange, suggestions, stripHash }: Props) {
  const [text, setText] = useState('')
  const listId = useId()

  function add() {
    let item = text.trim()
    if (stripHash) item = item.replace(/^#+/, '')
    setText('')
    if (!item || value.includes(item)) return
    onChange([...value, item])
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        {label}
        <input
          value={text}
          list={suggestions ? listId : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className="mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3"
        />
      </label>
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {value.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 text-sm">
            {item}
            <button
              type="button"
              aria-label={`Quitar ${item}`}
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="min-h-11 min-w-11 rounded-full text-neutral-600 hover:bg-neutral-200"
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" onClick={add} className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm">
          Añadir
        </button>
      </div>
    </div>
  )
}
