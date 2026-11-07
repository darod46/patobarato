import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AffiliateNotice } from './AffiliateNotice'

describe('AffiliateNotice', () => {
  it('discloses affiliate links', () => {
    render(<AffiliateNotice />)
    expect(screen.getByText(/comisión/)).toBeInTheDocument()
  })
})
