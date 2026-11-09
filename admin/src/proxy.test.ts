import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let user: { id: string } | null = null
let membership: { email: string; is_owner: boolean } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }),
    }),
  }),
}))

import { proxy } from './proxy'

const run = (path: string) => proxy(new NextRequest(`https://admin.example.com${path}`))
const location = (res: Response) => {
  const h = res.headers.get('location')
  return h ? new URL(h).pathname : null
}

describe('proxy', () => {
  beforeEach(() => {
    user = null
    membership = null
  })

  it('redirects anonymous to /login', async () => {
    expect(location(await run('/ofertas'))).toBe('/login')
    expect(location(await run('/'))).toBe('/login')
  })

  it('lets anonymous reach /login, /recuperar and /auth/*', async () => {
    for (const p of ['/login', '/recuperar', '/auth/confirm']) {
      expect(location(await run(p))).toBeNull()
    }
  })

  it('sends non-members to /sin-acceso', async () => {
    user = { id: 'u1' }
    expect(location(await run('/ofertas'))).toBe('/sin-acceso')
    expect(location(await run('/sin-acceso'))).toBeNull()
  })

  it('lets members through', async () => {
    user = { id: 'u1' }
    membership = { email: 'a@b.es', is_owner: false }
    expect(location(await run('/ofertas'))).toBeNull()
  })
})
