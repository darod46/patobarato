import { isCtaPlacement } from '../../../lib/telegram'
import { RequestLimiter } from '../../../lib/rate-limit'
import { getSupabase } from '../../../lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limiter = new RequestLimiter()
const HEADERS = { 'Cache-Control': 'no-store' }

function validPath(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('/') && v.length <= 200 && !v.includes('?') && !v.includes('#')
}

/** Counts a Telegram CTA click (placement + path only; no cookies, no IPs stored or logged). */
export async function POST(request: Request): Promise<Response> {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!limiter.allow(key)) return new Response(null, { status: 429, headers: HEADERS })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400, headers: HEADERS })
  }
  const { placement, path } = (body ?? {}) as { placement?: unknown; path?: unknown }
  if (!isCtaPlacement(placement) || !validPath(path)) return new Response(null, { status: 400, headers: HEADERS })

  try {
    const { error } = await getSupabase().from('cta_clicks').insert({ placement, path })
    if (error) console.error('clic: insert failed')
  } catch {
    console.error('clic: insert failed')
  }
  return new Response(null, { status: 204, headers: HEADERS })
}
