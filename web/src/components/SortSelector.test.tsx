import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SortSelector } from './SortSelector'

describe('SortSelector', () => {
  it('marks the active option and reports changes', async () => {
    const onChange = vi.fn()
    render(<SortSelector value="descuento" onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Ordenar' })
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Más recientes', 'Mayor descuento', 'Mínimo histórico'])
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false')
    expect(group).toContainElement(buttons[0])
    expect(buttons[0]).toHaveClass('min-h-11')
    await userEvent.click(buttons[2])
    expect(onChange).toHaveBeenCalledWith('minimo')
  })
})
