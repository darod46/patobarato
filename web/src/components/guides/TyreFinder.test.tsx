import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AWIN_FINDER, TyreFinder } from './TyreFinder'

const SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation'
const HEADING = 'Calcula el precio en tu medida'
const LOAD = 'Cargar el buscador de Neumaticos.es'
const NOTE = 'Al cargarlo, Awin establece cookies de seguimiento de afiliado en su propio dominio.'

describe('TyreFinder', () => {
  it('exports the exact Awin iframe URL', () => {
    expect(AWIN_FINDER).toBe('https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1')
  })

  it('renders a labelled section with heading, affiliate text, a load button and the cookie note, without iframe', () => {
    const { container } = render(<TyreFinder />)
    expect(screen.getByRole('region', { name: HEADING }).tagName).toBe('SECTION')
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument()
    expect(
      screen.getByText('Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.'),
    ).toBeInTheDocument()
    const button = screen.getByRole('button', { name: LOAD })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('loads one responsive iframe on click, replacing the button and the note', () => {
    const { container } = render(<TyreFinder />)
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.queryByText(NOTE)).toBeNull()
    const frames = container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const f = frames[0]!
    expect(f).toHaveAttribute('src', AWIN_FINDER)
    expect(f).toHaveAttribute('width', '100%')
    expect(f).toHaveAttribute('height', '600')
    expect(f).toHaveAttribute('title', 'Buscador de neumáticos de Neumaticos.es')
    expect(f).toHaveAttribute('loading', 'lazy')
    expect(f).toHaveAttribute('sandbox', SANDBOX)
    expect(f).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    expect(f.className).toContain('w-full')
    expect(f.getAttribute('style')).toBeNull()
  })

  it('gives each instance its own heading id and loads each one independently', () => {
    const { container } = render(
      <>
        <TyreFinder />
        <TyreFinder />
      </>,
    )
    const ids = [...container.querySelectorAll('h2')].map((h) => h.id)
    expect(new Set(ids).size).toBe(2)
    expect(screen.getAllByRole('region', { name: HEADING })).toHaveLength(2)
    const [first] = screen.getAllByRole('button', { name: LOAD })
    fireEvent.click(first!)
    expect(container.querySelectorAll('iframe')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: LOAD })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(container.querySelectorAll('iframe')).toHaveLength(2)
  })
})
