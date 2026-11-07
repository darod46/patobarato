import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComparisonTable } from './ComparisonTable'
import { item } from './fixtures'

describe('ComparisonTable', () => {
  it('has one row per distinct spec label and one column per item', () => {
    const items = [
      item(1, { specs: [{ label: 'Capacidad', value: '5 L' }, { label: 'Potencia', value: '1500 W' }] }),
      item(2, { specs: [{ label: 'Capacidad', value: '7 L' }] }),
    ]
    const { container } = render(<ComparisonTable items={items} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.getByText('7 L')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
  })
})
