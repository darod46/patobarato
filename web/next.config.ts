import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Code reads NEXT_PUBLIC_*; fall back to the v1 VITE_* names so existing Vercel env keeps working.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  },
  async rewrites() {
    // /go/{ASIN} is served by the static redirect page (affiliate tag added by script).
    return [{ source: '/go/:asin([A-Za-z0-9]{10})', destination: '/go.html' }]
  },
}

export default nextConfig
