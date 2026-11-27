import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NEUMATICOS_HOME, TyreStoreBanner } from './TyreStoreBanner'

describe('TyreStoreBanner', () => {
  it('links straight to Neumaticos.es through Awin, as a sponsored new-tab link with the affiliate note', () => {
    render(<TyreStoreBanner />)
    expect(NEUMATICOS_HOME).toBe('https://www.awin1.com/cread.php?awinmid=11552&awinaffid=3145511&campaign=winter+sale+2027&ued=https%3A%2F%2Fwww.neumaticos.es%2F&platform=ma')
    const link = screen.getByRole('link', { name: 'Ir a Neumaticos.es' })
    expect(link).toHaveAttribute('href', NEUMATICOS_HOME)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
    expect(screen.getByText(/Enlace de afiliado/)).toBeInTheDocument()
  })
})
