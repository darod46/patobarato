import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MobileNav } from './MobileNav'

const links = [
  { label: 'Chollos', href: '/#chollos' },
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
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when a link is clicked', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} />)
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    await user.click(screen.getByRole('link', { name: 'Chollos' }))
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('has the search field at the top of the panel, a GET form to /buscar', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const form = screen.getByRole('search', { name: 'Buscar chollos' })
    expect(form).toHaveAttribute('action', '/buscar')
    expect(form).toHaveAttribute('method', 'get')
    expect(form).toHaveClass('md:hidden')
    const input = screen.getByRole('searchbox', { name: 'Buscar chollos' })
    expect(input).toHaveAttribute('name', 'q')
    expect(input).toHaveClass('text-base')
    await user.type(input, 'freidora')
    expect(new FormData(form as HTMLFormElement).get('q')).toBe('freidora')
  })

  it('ends with the labelled channel button on phones', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} />)
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const join = screen.getByRole('link', { name: 'Unirme al canal' })
    expect(join).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(join).toHaveClass('w-full', 'sm:hidden')
  })

  it('leaves the search field out with search={false} (the search page has its own)', async () => {
    const user = userEvent.setup()
    render(<MobileNav links={links} search={false} />)
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Cupones' })).toBeInTheDocument()
  })

  it('names the button after what it does and closes on a click outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <p>fuera</p>
        <MobileNav links={links} />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByText('fuera'))
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
  })
})
