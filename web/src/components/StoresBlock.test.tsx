import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StoresBlock } from './StoresBlock'

describe('StoresBlock', () => {
  it('renders nothing with fewer than two stores', () => {
    const { container } = render(<StoresBlock stores={[{ store: 'amazon', deals: 5, coupons: 1 }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links each store page with its counts, singular and plural', () => {
    const { container } = render(
      <StoresBlock stores={[{ store: 'amazon', deals: 5, coupons: 1 }, { store: 'aliexpress', deals: 1, coupons: 0 }]} />,
    )
    expect(container.querySelector('section#tiendas')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Elige tu tienda favorita')
    const amazon = screen.getByRole('link', { name: /Amazon España/ })
    expect(amazon).toHaveAttribute('href', '/tiendas/amazon')
    expect(amazon).toHaveTextContent('5 chollos · 1 cupón')
    const ali = screen.getByRole('link', { name: /AliExpress/ })
    expect(ali).toHaveAttribute('href', '/tiendas/aliexpress')
    expect(ali).toHaveTextContent('1 chollo · 0 cupones')
  })
})
