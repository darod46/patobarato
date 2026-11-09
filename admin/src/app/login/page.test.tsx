import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const signInWithPassword = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('../../lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { signInWithPassword } }),
}))

import LoginPage from './page'

describe('login page', () => {
  it('shows Spanish error on bad credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.es')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes to / on success and links to password recovery', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: 'He olvidado mi contraseña' })).toHaveAttribute('href', '/recuperar')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.es')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'goodpass1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })
})
