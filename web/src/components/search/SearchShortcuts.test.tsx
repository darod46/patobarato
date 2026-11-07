import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SearchShortcuts } from './SearchShortcuts'

it('renders tag and store chips as links', () => {
  render(<SearchShortcuts tags={['sony', 'hogar']} stores={['amazon']} />)
  expect(screen.getByRole('heading', { name: 'Búsquedas habituales' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '#sony' })).toHaveAttribute('href', '/chollos/sony')
  expect(screen.getByRole('heading', { name: 'Tiendas' })).toBeInTheDocument()
  const store = screen.getByRole('link', { name: /amazon/i })
  expect(store.getAttribute('href')).toMatch(/^\/tiendas\//)
  expect(store.className).toContain('min-h-11')
})

it('omits empty groups', () => {
  render(<SearchShortcuts tags={[]} stores={[]} />)
  expect(screen.queryByRole('heading')).toBeNull()
})
