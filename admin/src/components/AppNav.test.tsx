import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const signOut = vi.fn().mockResolvedValue({ error: null })
const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ofertas',
  useRouter: () => ({ replace, refresh }),
}))
vi.mock('../lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { signOut } }),
}))

import { AppNav } from './AppNav'

describe('AppNav', () => {
  it('hides Usuarios for non-owners', () => {
    render(<AppNav isOwner={false} />)
    expect(screen.getByRole('link', { name: 'Ofertas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('shows Usuarios for owners', () => {
    render(<AppNav isOwner />)
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/usuarios')
  })

  it('signs out and goes to /login', async () => {
    render(<AppNav isOwner={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(signOut).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/login')
  })
})
