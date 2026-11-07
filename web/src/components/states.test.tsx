import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

describe('listing states', () => {
  it('EmptyState clears filters', async () => {
    const onClear = vi.fn()
    render(<EmptyState onClear={onClear} />)
    expect(screen.getByText('No hay chollos con esos filtros')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('EmptyState takes a message and omits the button without onClear', () => {
    render(<EmptyState message="Ningún chollo coincide con “x”" />)
    expect(screen.getByText('Ningún chollo coincide con “x”')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ErrorState retries', async () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
