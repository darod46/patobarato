import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AWIN_FINDER, TyreFinder } from './TyreFinder'

const SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation'
const HEADING = 'Calcula el precio en tu medida'
const NOTE =
  'Buscador de Neumaticos.es con enlace de afiliado: si compras tras usarlo, PatoBarato puede recibir una comisión. Lo sirve Awin, que establece cookies de seguimiento de afiliado en su propio dominio.'

describe('TyreFinder', () => {
  it('embeds the Neumaticos.es configurator through Awin’s click URL (not the wrapper frame)', () => {
    expect(AWIN_FINDER).toBe(
      'https://www.awin1.com/awclick.php?mid=11552&id=3145511&gid=397643&linkid=2718820&p=https://www.neumaticos.es/affiliates/configurator?ID=aff_tn_es_awin',
    )
  })

  it('shows the finder straight away, with no load button', () => {
    const { container } = render(<TyreFinder />)
    expect(screen.getByRole('region', { name: HEADING }).tagName).toBe('SECTION')
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    const frames = container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const f = frames[0]!
    expect(f).toHaveAttribute('src', AWIN_FINDER)
    expect(f).toHaveAttribute('width', '100%')
    expect(f).toHaveAttribute('height', '580')
    expect(f).toHaveAttribute('title', 'Buscador de neumáticos de Neumaticos.es')
    expect(f).toHaveAttribute('loading', 'lazy')
    expect(f).toHaveAttribute('sandbox', SANDBOX)
    expect(f).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  })

  it('puts the affiliate and cookie note after the finder', () => {
    const { container } = render(<TyreFinder />)
    const note = screen.getByText(NOTE)
    const frame = container.querySelector('iframe')!
    expect(frame.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(note).toBe(container.querySelector('section')!.lastElementChild)
  })

  it('gives each instance its own heading id', () => {
    const { container } = render(
      <>
        <TyreFinder />
        <TyreFinder />
      </>,
    )
    const ids = [...container.querySelectorAll('h2')].map((h) => h.id)
    expect(new Set(ids).size).toBe(2)
  })
})
