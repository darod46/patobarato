import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeaderSearch } from './HeaderSearch'
import { HeaderSearchToggle } from './HeaderSearchToggle'

describe('HeaderSearchToggle', () => {
  it('starts closed with a magnifier button and opens the strip on click, focusing the field', () => {
    render(
      <HeaderSearchToggle>
        <HeaderSearch />
      </HeaderSearchToggle>,
    )
    const button = screen.getByRole('button', { name: 'Buscar' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Buscar chollos')).not.toBeVisible()
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Cerrar búsqueda' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Buscar chollos')).toBeVisible()
    expect(screen.getByLabelText('Buscar chollos')).toHaveFocus()
  })

  it('closes with Escape and returns focus to the button', () => {
    render(
      <HeaderSearchToggle>
        <HeaderSearch />
      </HeaderSearchToggle>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.keyDown(screen.getByLabelText('Buscar chollos'), { key: 'Escape' })
    expect(screen.getByLabelText('Buscar chollos')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Buscar' })).toHaveFocus()
  })

  it('can start open without stealing focus', () => {
    render(
      <HeaderSearchToggle initiallyOpen>
        <HeaderSearch value="sony" onChange={() => {}} />
      </HeaderSearchToggle>,
    )
    expect(screen.getByLabelText('Buscar chollos')).toBeVisible()
    expect(screen.getByLabelText('Buscar chollos')).not.toHaveFocus()
  })
})
