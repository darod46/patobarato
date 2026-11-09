import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ user: null as { id: string } | null, known: new Set<string>() }))

vi.mock('../../../lib/supabase/server', () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, url: string) => ({
          limit: async () => ({ data: table === 'products' && db.known.has(url) ? [{ image_url: url }] : [], error: null }),
        }),
      }),
    }),
  }),
}))

import { GET } from './route'

const call = (url: string | null) =>
  GET(new Request(`https://admin.example.com/api/imagen${url === null ? '' : `?url=${encodeURIComponent(url)}`}`))

describe('imagen', () => {
  beforeEach(() => {
    db.user = { id: 'u1' }
    db.known = new Set(['https://img.shop.es/a.png'])
    process.env.NEXT_PUBLIC_WEB_URL = 'https://patobarato.es'
    vi.unstubAllGlobals()
  })

  it('401 without session', async () => {
    db.user = null
    expect((await call('https://img.shop.es/a.png')).status).toBe(401)
  })

  it('403 for unknown host/url', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await call('https://evil.example/a.png')).status).toBe(403)
    expect((await call('https://patobarato.es.evil.example/a.png')).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('400 for missing or non-http urls', async () => {
    expect((await call(null)).status).toBe(400)
    expect((await call('file:///etc/passwd')).status).toBe(400)
    expect((await call('javascript:alert(1)')).status).toBe(400)
  })

  it('streams known product image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('img', { status: 200, headers: { 'content-type': 'image/png' } })))
    const res = await call('https://img.shop.es/a.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(await res.text()).toBe('img')
  })

  it('allows images under the web origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('i', { headers: { 'content-type': 'image/webp' } })))
    expect((await call('https://patobarato.es/x/y.webp')).status).toBe(200)
  })

  it('502 on upstream failure, timeout or non-image content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404, headers: { 'content-type': 'image/png' } })))
    expect((await call('https://img.shop.es/a.png')).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    expect((await call('https://img.shop.es/a.png')).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } })))
    expect((await call('https://img.shop.es/a.png')).status).toBe(502)
  })
})
