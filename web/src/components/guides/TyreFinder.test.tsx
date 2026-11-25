import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AWIN_FINDER_NARROW, AWIN_FINDER_WIDE, TyreFinder } from './TyreFinder'

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation'
const HEADING = 'Calcula el precio en tu medida'

describe('TyreFinder', () => {
  it('exports the exact Awin iframe URLs', () => {
    expect(AWIN_FINDER_WIDE).toBe('https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1')
    expect(AWIN_FINDER_NARROW).toBe('https://www.awin1.com/cawshow.php?v=11552&s=2718820&q=397643&r=3145511&iframe=1')
  })

  it('renders a labelled section with heading, affiliate text and two iframes', () => {
    const { container } = render(<TyreFinder />)
    expect(screen.getByRole('region', { name: HEADING }).tagName).toBe('SECTION')
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument()
    expect(
      screen.getByText('Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.'),
    ).toBeInTheDocument()
    const frames = [...container.querySelectorAll('iframe')]
    expect(frames.map((f) => f.getAttribute('src'))).toEqual([AWIN_FINDER_WIDE, AWIN_FINDER_NARROW])
    for (const f of frames) {
      expect(f).toHaveAttribute('title', 'Buscador de neumáticos de Neumaticos.es')
      expect(f).toHaveAttribute('loading', 'lazy')
      expect(f).toHaveAttribute('sandbox', SANDBOX)
      expect(f).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    }
    const [wide, narrow] = frames
    expect(wide).toHaveAttribute('width', '728')
    expect(wide).toHaveAttribute('height', '90')
    expect(wide!.className).toContain('hidden')
    expect(wide!.className).toContain('md:block')
    expect(narrow).toHaveAttribute('width', '468')
    expect(narrow).toHaveAttribute('height', '60')
  })

  it('keeps the narrow iframe from overflowing: clipped wrapper, iframe scaled from the top left', () => {
    const { container } = render(<TyreFinder />)
    const narrow = container.querySelectorAll('iframe')[1]!
    const wrapper = narrow.parentElement!
    expect(wrapper.className).toContain('md:hidden')
    expect(wrapper.className).toContain('overflow-hidden')
    expect(narrow.style.transform).toBe('scale(var(--finder-scale))')
    expect(narrow.style.transformOrigin).toBe('top left')
    expect(wrapper.style.height).toBe('calc(60px * var(--finder-scale))')
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
    expect(screen.getAllByRole('region', { name: HEADING })).toHaveLength(2)
  })
})
