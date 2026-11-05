import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ErrorPage from './error'

describe('ErrorPage', () => {
  it('explains the failure in Spanish, retries and links home', async () => {
    const retry = vi.fn()
    render(<ErrorPage error={new Error('boom')} retry={retry} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Algo ha fallado al cargar los chollos' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
