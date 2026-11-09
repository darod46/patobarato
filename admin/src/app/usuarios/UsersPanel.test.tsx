import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  getMembership: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`)
  }),
  rows: [] as unknown[],
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: m.rows, error: null }) }) }),
  }),
}))
vi.mock('../../lib/supabase/server', () => ({ createServerSupabase: async () => ({}) }))
vi.mock('../../lib/membership', () => ({ getMembership: m.getMembership }))
vi.mock('next/navigation', () => ({ redirect: m.redirect }))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))
vi.mock('../../components/JobStatus', () => ({ JobStatus: ({ jobId }: { jobId: number | null }) => <p>job {jobId}</p> }))

import UsuariosPage from './page'
import { UsersPanel } from './UsersPanel'

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [
    { user_id: 'u1', email: 'yo@x.es', is_owner: true, created_at: '2026-11-01T10:00:00Z' },
    { user_id: 'u2', email: 'otro@x.es', is_owner: false, created_at: '2026-11-05T10:00:00Z' },
  ]
  m.enqueueJob.mockResolvedValue(11)
  m.jobState = { status: null, error: null, result: null, stuck: false }
})

describe('Usuarios', () => {
  it('non-owner is redirected', async () => {
    m.getMembership.mockResolvedValue({ email: 'a@x.es', isOwner: false })
    await expect(UsuariosPage()).rejects.toThrow('REDIRECT /ofertas')
    expect(m.redirect).toHaveBeenCalledWith('/ofertas')
  })

  it('invite enqueues invite_user with the email', async () => {
    render(<UsersPanel currentEmail="yo@x.es" />)
    await screen.findByText('otro@x.es')
    await userEvent.type(screen.getByLabelText('Email'), 'nuevo@x.es')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }))
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'invite_user', { email: 'nuevo@x.es' }))
  })

  it('rejects an invalid email', async () => {
    render(<UsersPanel currentEmail="yo@x.es" />)
    await userEvent.type(screen.getByLabelText('Email'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }))
    expect(await screen.findByText('Email no válido')).toBeTruthy()
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it('cannot revoke yourself', async () => {
    render(<UsersPanel currentEmail="yo@x.es" />)
    await screen.findByText('otro@x.es')
    expect(screen.getAllByRole('button', { name: 'Quitar acceso' })).toHaveLength(1)
    expect(screen.getByText('Propietario')).toBeTruthy()
    expect(screen.getByText('05/11/2026')).toBeTruthy()
  })

  it('revoke asks confirmation and enqueues revoke_user', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UsersPanel currentEmail="yo@x.es" />)
    await screen.findByText('otro@x.es')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'revoke_user', { user_id: 'u2' }))
  })
})
