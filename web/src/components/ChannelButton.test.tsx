import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChannelButton } from './ChannelButton'

describe('ChannelButton', () => {
  it('links to the channel in a new tab, as a one-line pill with the plane in its own circle', () => {
    render(<ChannelButton placement="hero">Recibirlos en Telegram</ChannelButton>)
    const link = screen.getByRole('link', { name: 'Recibirlos en Telegram' })
    expect(link).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveClass('rounded-full', 'whitespace-nowrap', 'bg-primary', 'h-11', 'pr-4')
    expect(link.querySelector('svg')?.parentElement).toHaveClass('rounded-full', 'size-9')
  })

  it('has light and inverse variants and a large size', () => {
    const { rerender } = render(
      <ChannelButton placement="hero" variant="light" size="lg">
        Unirme
      </ChannelButton>,
    )
    expect(screen.getByRole('link', { name: 'Unirme' })).toHaveClass('bg-white', 'text-ink', 'h-14')
    rerender(
      <ChannelButton placement="block" variant="inverse" size="lg">
        Unirme
      </ChannelButton>,
    )
    expect(screen.getByRole('link', { name: 'Unirme' })).toHaveClass('bg-white', 'text-primary', 'focus-visible:outline-white')
  })

  it('can hide its label on some breakpoints while keeping an accessible name', () => {
    render(
      <ChannelButton placement="header" aria-label="Unirme al canal" labelClassName="hidden sm:inline" className="sm:pr-4">
        Unirme al canal
      </ChannelButton>,
    )
    const link = screen.getByRole('link', { name: 'Unirme al canal' })
    expect(link).not.toHaveClass('pr-4')
    expect(screen.getByText('Unirme al canal')).toHaveClass('hidden', 'sm:inline')
  })
})
