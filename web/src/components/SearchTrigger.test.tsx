import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SearchTrigger } from './SearchTrigger'

it('is a link to /buscar labelled Buscar with the pill text', () => {
  render(<SearchTrigger />)
  const link = screen.getByRole('link', { name: 'Buscar' })
  expect(link).toHaveAttribute('href', '/buscar')
  expect(link).toHaveTextContent('Buscar chollos…')
  expect(link).toHaveClass('size-11', 'md:h-11', 'md:max-w-[320px]')
})
