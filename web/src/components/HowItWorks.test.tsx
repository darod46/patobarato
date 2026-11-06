import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HowItWorks } from './HowItWorks'

describe('HowItWorks', () => {
  it('describes only what the bot does', () => {
    const { container } = render(<HowItWorks />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cómo cazamos cada chollo')
    expect(container.textContent).not.toMatch(/Verificamos|bajadas de precio de las tiendas/)
    expect(container.textContent).toContain('canales de chollos de Telegram')
    expect(container.textContent).toContain('publicaciones anteriores')
  })
})
