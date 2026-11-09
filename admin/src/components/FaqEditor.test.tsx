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

describe("FaqEditor stable keys", () => {
  it("per-row preview state follows the row when reordered", async () => {
    render(<Host initial={[{ q: "A", a_md: "aa" }, { q: "B", a_md: "bb" }]} />)
    await userEvent.click(screen.getAllByRole("button", { name: "Vista previa" })[1])
    await userEvent.click(screen.getAllByRole("button", { name: "Subir" })[1])
    const previews = screen.getAllByTestId("markdown-preview")
    expect(previews).toHaveLength(1)
    expect(previews[0]).toHaveTextContent("bb")
    expect(screen.getAllByRole("button", { name: "Vista previa" })[0]).toHaveAttribute("aria-pressed", "true")
  })
})
