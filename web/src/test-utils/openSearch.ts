import { fireEvent, screen } from '@testing-library/react'

/** Opens the header search strip (closed by default) and returns the field. */
export function openSearch(): HTMLElement {
  const toggle = screen.queryByRole('button', { name: 'Buscar' })
  if (toggle) fireEvent.click(toggle)
  return screen.getByRole('searchbox', { name: 'Buscar chollos' })
}
