import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { FaqEditor } from './FaqEditor'

type Item = { q: string; a_md: string }
let latest: Item[] = []
function Host({ initial }: { initial: Item[] }) {
  const [v, setV] = useState(initial)
  useEffect(() => {
    latest = v
  })
  return <FaqEditor value={v} onChange={setV} />
}

describe('FaqEditor', () => {
  it('faq editor adds, removes and reorders', async () => {
    render(<Host initial={[{ q: 'A', a_md: 'a' }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Añadir pregunta' }))
    expect(latest).toHaveLength(2)
    await userEvent.type(screen.getAllByLabelText('Pregunta')[1], 'B')
    expect(latest[1].q).toBe('B')
    await userEvent.click(screen.getAllByRole('button', { name: 'Subir' })[1])
    expect(latest.map((i) => i.q)).toEqual(['B', 'A'])
    await userEvent.click(screen.getAllByRole('button', { name: 'Bajar' })[0])
    expect(latest.map((i) => i.q)).toEqual(['A', 'B'])
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0])
    expect(latest.map((i) => i.q)).toEqual(['B'])
  })
})
