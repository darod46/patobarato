import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
vi.mock('../../../lib/supabase', () => ({ getSupabase: () => ({ from: () => ({ insert }) }) }))

import { POST } from './route'

let ipCounter = 0
function req(body: unknown, ip = `10.0.0.${++ipCounter}`, raw = false): Request {
  return new Request('http://localhost/api/clic', {
    method: 'POST',
    headers: { 'x-forwarded-for': `${ip}, 1.1.1.1`, 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

describe('POST /api/clic', () => {
  beforeEach(() => {
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it('stores a valid click and answers 204 with no-store', async () => {
    const res = await POST(req({ placement: 'hero', path: '/' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(insert).toHaveBeenCalledWith({ placement: 'hero', path: '/' })
  })

  it.each([
    ['invalid JSON', '{nope', true],
    ['unknown placement', { placement: 'x', path: '/' }, false],
    ['path without slash', { placement: 'hero', path: 'oferta' }, false],
    ['path with query', { placement: 'hero', path: '/a?b=1' }, false],
    ['path with hash', { placement: 'hero', path: '/a#b' }, false],
    ['path too long', { placement: 'hero', path: '/' + 'a'.repeat(200) }, false],
    ['non-string path', { placement: 'hero', path: 5 }, false],
    ['null body', null, false],
  ])('400 for %s', async (_n, body, raw) => {
    const res = await POST(req(body, undefined, raw as boolean))
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it('accepts a path of exactly 200 characters', async () => {
    const res = await POST(req({ placement: 'hero', path: '/' + 'a'.repeat(199) }))
    expect(res.status).toBe(204)
  })

  it('429 on the 21st request from the same ip', async () => {
    const ip = '203.0.113.9'
    for (let i = 0; i < 20; i++) expect((await POST(req({ placement: 'deal', path: '/' }, ip))).status).toBe(204)
    const res = await POST(req({ placement: 'deal', path: '/' }, ip))
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('204 when insert returns an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockResolvedValue({ error: { message: 'boom' } })
    expect((await POST(req({ placement: 'hero', path: '/' }))).status).toBe(204)
    expect(spy).toHaveBeenCalledWith('clic: insert failed')
    spy.mockRestore()
  })

  it('204 when insert throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockRejectedValue(new Error('down'))
    expect((await POST(req({ placement: 'hero', path: '/' }))).status).toBe(204)
    spy.mockRestore()
  })
})
