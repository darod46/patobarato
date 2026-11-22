import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackCtaClick } from './cta'

afterEach(() => vi.unstubAllGlobals())

describe('trackCtaClick', () => {
  it('uses sendBeacon with a JSON blob when available', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })
    trackCtaClick('hero', '/ofertas')
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/clic')
    expect(blob).toBeInstanceOf(Blob)
    expect(JSON.parse(await blob.text())).toEqual({ placement: 'hero', path: '/ofertas' })
  })

  it('defaults the path to location.pathname', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })
    trackCtaClick('footer')
    const blob = sendBeacon.mock.calls[0][1] as Blob
    expect(JSON.parse(await blob.text())).toEqual({ placement: 'footer', path: location.pathname })
  })

  it('falls back to fetch keepalive without sendBeacon', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', fetchMock)
    trackCtaClick('block', '/')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clic',
      expect.objectContaining({ method: 'POST', keepalive: true, body: JSON.stringify({ placement: 'block', path: '/' }) }),
    )
  })

  it('falls back to fetch when sendBeacon returns false', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) })
    vi.stubGlobal('fetch', fetchMock)
    trackCtaClick('block', '/')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('never throws when both fail', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('x')
      },
    })
    vi.stubGlobal('fetch', () => {
      throw new Error('y')
    })
    expect(() => trackCtaClick('deal', '/')).not.toThrow()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('z')))
    expect(() => trackCtaClick('deal', '/')).not.toThrow()
  })
})
