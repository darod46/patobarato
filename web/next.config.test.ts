import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

describe('next.config', () => {
  it('redirects old ?q= links on / and /chollos to /buscar, forwarding the value', async () => {
    const redirects = await nextConfig.redirects!()
    for (const source of ['/', '/chollos']) {
      expect(redirects).toContainEqual({
        source,
        has: [{ type: 'query', key: 'q', value: '(?<q>.*)' }],
        destination: '/buscar?q=:q',
        permanent: true,
      })
    }
  })

  it('redirects old ?tag= / ?orden= / ?tienda= links on / to /chollos with the same query', async () => {
    const redirects = await nextConfig.redirects!()
    for (const [key, name] of [['tag', 'tag'], ['orden', 'orden'], ['tienda', 'tienda']]) {
      expect(redirects).toContainEqual({
        source: '/',
        has: [{ type: 'query', key, value: `(?<${name}>.*)` }],
        destination: `/chollos?${key}=:${name}`,
        permanent: true,
      })
    }
  })

  it('has no rewrite that targets /buscar', async () => {
    const rewrites = await nextConfig.rewrites!()
    const all = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? []), ...(rewrites.fallback ?? [])]
    expect(all.filter((r) => r.destination.startsWith('/buscar'))).toEqual([])
    expect(all).toContainEqual({ source: '/go/:asin([A-Za-z0-9]{10})', destination: '/go.html' })
  })

  it('keeps the ?q= noindex header but no unconditional one on /buscar', async () => {
    const headers = await nextConfig.headers!()
    expect(headers.map((h) => h.source)).not.toContain('/buscar')
    expect(headers).toContainEqual({
      source: '/:path*',
      has: [{ type: 'query', key: 'q' }],
      headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
    })
  })
})
