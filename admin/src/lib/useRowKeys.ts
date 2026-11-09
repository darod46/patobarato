'use client'

import { useState } from 'react'

let counter = 0
const newKey = () => `row-${counter++}`

/**
 * Stable React keys for an editable list whose rows can be added, removed and moved.
 * Keys live in component state and move with the rows, so per-row state (e.g. Markdown preview) follows the item.
 */
export function useRowKeys(initialLength: number) {
  const [keys, setKeys] = useState<string[]>(() => Array.from({ length: initialLength }, newKey))
  return {
    keys,
    add: () => setKeys((k) => [...k, newKey()]),
    remove: (i: number) => setKeys((k) => k.filter((_, j) => j !== i)),
    move: (i: number, d: -1 | 1) =>
      setKeys((k) => {
        const next = [...k]
        ;[next[i], next[i + d]] = [next[i + d], next[i]]
        return next
      }),
  }
}
