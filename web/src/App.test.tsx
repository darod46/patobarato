import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App'

it('renders the brand heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'PatoBarato' })).toBeInTheDocument()
})
