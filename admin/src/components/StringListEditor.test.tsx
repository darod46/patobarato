import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { StringListEditor } from './StringListEditor'

let latest: string[] = []
function Host({ stripHash }: { stripHash?: boolean }) {
  const [v, setV] = useState<string[]>(['amazon'])
  useEffect(() => {
    latest = v
  })
  return <StringListEditor label="Etiquetas" value={v} onChange={setV} stripHash={stripHash} suggestions={['pccomponentes']} />
}

describe('StringListEditor', () => {
  it('adds with Enter, ignores duplicates and removes', async () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    await userEvent.type(input, 'pccomponentes{Enter}')
    await userEvent.type(input, 'amazon{Enter}')
    expect(latest).toEqual(['amazon', 'pccomponentes'])
    await userEvent.click(screen.getByRole('button', { name: 'Quitar amazon' }))
    expect(latest).toEqual(['pccomponentes'])
  })
  it('strips leading # when asked', async () => {
    render(<Host stripHash />)
    await userEvent.type(screen.getByLabelText('Etiquetas'), '#BlackFriday{Enter}')
    expect(latest).toContain('BlackFriday')
  })
})
