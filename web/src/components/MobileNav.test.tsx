import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MobileNav } from './MobileNav'

const links = [
  { label: 'Chollos', href: '/chollos' },
  { label: 'Cupones', href: '/cupones' },
]

describe('MobileNav', () => {
  it('opens on click and closes with Escape', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} />)
    const button = screen.getByRole('button', { name: 'Abrir menú' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Cupones' })).toBeNull()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Cupones' })).toHaveAttribute('href', '/cupones')
    await user.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when a link is clicked', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} />)
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    await user.click(screen.getByRole('link', { name: 'Chollos' }))
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
  })
})
