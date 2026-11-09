import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ user: null as { id: string } | null, known: new Set<string>(), lookups: [] as string[][] }))

vi.mock('../../../lib/supabase/server', () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, urls: string[]) => ({
          limit: async () => {
            db.lookups.push(urls)
            return { data: table === 'products' && urls.some((u) => db.known.has(u)) ? [{ image_url: urls[0] }] : [], error: null }
          },
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
    db.lookups = []
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
  it('rejects svg', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })))
    expect((await call('https://img.shop.es/a.png')).status).toBe(502)
  })

  it('sets nosniff and sandbox CSP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('i', { headers: { 'content-type': 'image/png' } })))
    const res = await call('https://img.shop.es/a.png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
  })

  it('rejects private hosts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const hosts = ['localhost', 'a.localhost', 'db.internal', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.1.1', '169.254.169.254', '[::1]', '[fc00::1]', '[fd12::1]', '[fe80::1]']
    for (const h of hosts) {
      db.known.add(`http://${h}/a.png`)
      expect((await call(`http://${h}/a.png`)).status, h).toBe(403)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks up both the raw and the normalised url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('i', { headers: { 'content-type': 'image/png' } })))
    db.known = new Set(['https://IMG.shop.es:443/a b.png'])
    expect((await call('https://IMG.shop.es:443/a b.png')).status).toBe(200)
    expect(db.lookups[0]).toHaveLength(2)
  })
})
