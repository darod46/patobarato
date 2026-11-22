import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TELEGRAM_URL } from '../lib/telegram'
import { NextDealCta } from './NextDealCta'

describe('NextDealCta', () => {
  it('names the category when the deal has one', () => {
    render(<NextDealCta hashtags={['#oferta', '#tecnologia']} />)
    expect(screen.getByRole('heading', { level: 2, name: '¿Se te ha escapado?' })).toBeInTheDocument()
    expect(screen.getByText(/El próximo chollo de tecnología también saldrá en el canal/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Avísame del próximo' })
    expect(link).toHaveAttribute('href', TELEGRAM_URL)
  })

  it('falls back to a generic sentence without a category', () => {
    render(<NextDealCta hashtags={['#oferta']} />)
    expect(screen.getByText(/El próximo chollo como este también saldrá en el canal, con su precio y su cupón\./)).toBeInTheDocument()
  })
})
