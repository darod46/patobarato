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

  it('illustrates each step with its duck image, lazily loaded and with alt text', () => {
    render(<HowItWorks />)
    const images = screen.getAllByRole('img')
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      '/como-funciona/vigilamos.jpeg',
      '/como-funciona/filtramos.jpeg',
      '/como-funciona/publicamos.jpeg',
    ])
    for (const img of images) {
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img.getAttribute('alt')).toMatch(/^El pato de PatoBarato/)
    }
  })
})
