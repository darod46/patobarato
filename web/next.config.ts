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
    // `/chollos/{tag}?q=…` whose HTML cannot depend on the query string. `/buscar` itself
    // (without `q`) is indexable.
    return [
      {
        // Deal pages are dynamic (no ISR writes); Vercel's CDN keeps each one 10 minutes and may serve it
        // stale for another hour while it refreshes. Browsers do not cache them.
        source: '/oferta/:store/:slug',
        headers: [{ key: 'Vercel-CDN-Cache-Control', value: 'max-age=600, stale-while-revalidate=3600' }],
      },
      {
        source: '/:path*',
        has: [{ type: 'query', key: 'q' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ]
  },
  async redirects() {
    // v1/v2 links: a search on the home or the listing is now `/buscar?q=…`, and the old listing
    // filters on the home live on `/chollos`. The named capture makes `:q` (etc.) available in the
    // destination. `/chollos?tag=…|orden=…|tienda=…` stays where it is (a pure listing).
    const capture = (key: string) => ({ type: 'query' as const, key, value: `(?<${key}>.*)` })
    return [
      { source: '/', has: [capture('q')], destination: '/buscar?q=:q', permanent: true },
      { source: '/chollos', has: [capture('q')], destination: '/buscar?q=:q', permanent: true },
      { source: '/', has: [capture('tag')], destination: '/chollos?tag=:tag', permanent: true },
      { source: '/', has: [capture('orden')], destination: '/chollos?orden=:orden', permanent: true },
      { source: '/', has: [capture('tienda')], destination: '/chollos?tienda=:tienda', permanent: true },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
