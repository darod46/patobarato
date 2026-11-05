import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Code reads NEXT_PUBLIC_*; fall back to the v1 VITE_* names so existing Vercel env keeps working.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  },
  async headers() {
    // Any URL with a search (`?q=`) stays out of the index, also on cached pages such as
    // `/chollos/{tag}?q=…` whose HTML cannot depend on the query string.
    return [
      {
        source: '/:path*',
        has: [{ type: 'query', key: 'q' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
      {
        // Internal target of the `/?q=` / `/?tag=` rewrites; header rules match the original
        // request path, so only direct hits on /buscar get this.
        source: '/buscar',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ]
  },
  async rewrites() {
    return {
      // v1 links `/?q=` and `/?tag=` need per-request metadata (noindex, canonical to the hashtag
      // page). They are served by the dynamic `/buscar` route so `/` itself stays static (ISR).
      beforeFiles: [
        { source: '/', has: [{ type: 'query', key: 'q' }], destination: '/buscar' },
        { source: '/', has: [{ type: 'query', key: 'tag' }], destination: '/buscar' },
      ],
      afterFiles: [
        // /go/{ASIN} is served by the static redirect page (affiliate tag added by script).
        { source: '/go/:asin([A-Za-z0-9]{10})', destination: '/go.html' },
      ],
      fallback: [],
    }
  },
}

export default nextConfig
