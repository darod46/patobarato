import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyOtp = vi.fn()

vi.mock('../../../lib/supabase/server', () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp } }),
}))

import { GET } from './route'

const call = (qs: string) => GET(new Request(`https://admin.example.com/auth/confirm${qs}`))

describe('auth/confirm', () => {
  beforeEach(() => verifyOtp.mockReset())

  it('verifies otp and redirects to /cuenta/contrasena', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const res = await call('?token_hash=abc&type=invite')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'invite', token_hash: 'abc' })
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/cuenta/contrasena')
  })

  it('with bad token redirects to /login?error=enlace', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    const res = await call('?token_hash=bad&type=recovery')
    const url = new URL(res.headers.get('location')!)
    expect(url.pathname + url.search).toBe('/login?error=enlace')
  })

  it('rejects a missing token or unsupported type without calling Supabase', async () => {
    for (const qs of ['', '?token_hash=abc', '?token_hash=abc&type=email', '?type=invite']) {
      const res = await call(qs)
      const url = new URL(res.headers.get('location')!)
      expect(url.pathname + url.search).toBe('/login?error=enlace')
    }
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})
