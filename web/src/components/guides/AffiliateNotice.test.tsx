import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AffiliateNotice } from './AffiliateNotice'

describe('AffiliateNotice', () => {
  it('starts with the exact disclosure sentence', () => {
    const { container } = render(<AffiliateNotice />)
    expect(container.textContent).toContain(
      'Esta guía contiene enlaces de afiliado. Si compras, recibimos una comisión sin coste para ti. No afecta a la selección.',
    )
    expect(container.textContent).toContain('Afiliado de Amazon')
  })
})
