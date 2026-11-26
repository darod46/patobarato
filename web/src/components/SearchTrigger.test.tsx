import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SearchTrigger } from './SearchTrigger'

it('is a GET form to /buscar with a typeable q field on md+', () => {
  render(<SearchTrigger />)
  const form = screen.getByRole('search', { name: 'Buscar chollos' })
  expect(form).toHaveAttribute('action', '/buscar')
  expect(form).toHaveAttribute('method', 'get')
  expect(form).toHaveClass('hidden', 'md:block')
  const input = screen.getByRole('searchbox', { name: 'Buscar chollos' })
  expect(input).toHaveAttribute('name', 'q')
  expect(input).toHaveAttribute('placeholder', 'Buscar chollos…')
  expect(input).toHaveAttribute('enterkeyhint', 'search')
  fireEvent.change(input, { target: { value: 'freidora' } })
  expect(new FormData(form as HTMLFormElement).get('q')).toBe('freidora')
})

