import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SearchField } from './SearchField'

it('is a GET search form to /buscar with a tall input', () => {
  render(<SearchField value="" onChange={() => {}} />)
  const form = screen.getByRole('search')
  expect(form).toHaveAttribute('action', '/buscar')
  expect(form).toHaveAttribute('method', 'get')
  const input = screen.getByRole('searchbox')
  expect(input).toHaveAttribute('name', 'q')
  expect(input.className).toContain('h-14')
  expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
})

it('clears with the X button', async () => {
  const onChange = vi.fn()
  render(<SearchField value="lego" onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))
  expect(onChange).toHaveBeenCalledWith('')
})

it('applies at once on Enter without submitting the form', () => {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  render(<SearchField value="lego" onChange={onChange} onSubmit={onSubmit} />)
  const notPrevented = fireEvent.submit(screen.getByRole('search'))
  expect(notPrevented).toBe(false)
  expect(onChange).toHaveBeenCalledWith('lego')
  expect(onSubmit).toHaveBeenCalled()
})

it('autofocuses only when asked', () => {
  const { rerender } = render(<SearchField value="" onChange={() => {}} autoFocus />)
  expect(screen.getByRole('searchbox')).toHaveFocus()
  rerender(<SearchField key="b" value="" onChange={() => {}} />)
  expect(screen.getByRole('searchbox')).not.toHaveFocus()
})
