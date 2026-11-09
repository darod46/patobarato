import { createServerSupabase } from '../../../lib/supabase/server'

const noStore = { 'Cache-Control': 'no-store' }

function parseHttp(raw: string | null): URL | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

function isSafeImageType(type: string): boolean {
  const t = type.toLowerCase().split(';')[0].trim()
  return t.startsWith('image/') && t !== 'image/svg+xml'
}

function isPrivateHost(url: URL): boolean {
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (h.includes(':')) {
    if (h === '::1' || h === '::' || h.startsWith('::ffff:')) return true
    const first = h.split(':')[0]
    const n = first === '' ? 0 : parseInt(first, 16)
    if ((n & 0xfe00) === 0xfc00 || (n & 0xffc0) === 0xfe80) return true
  }
  return false
}

function isWebOrigin(target: URL): boolean {
  const web = parseHttp(process.env.NEXT_PUBLIC_WEB_URL ?? null)
  return web !== null && web.origin === target.origin
}

/** Authenticated same-origin proxy for store images (cross-origin images cannot be copied from the browser). */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return new Response('No autorizado', { status: 401, headers: noStore })

  const raw = new URL(request.url).searchParams.get('url')
  const target = parseHttp(raw)
  if (!target) return new Response('URL no válida', { status: 400, headers: noStore })
  if (isPrivateHost(target)) return new Response('Prohibido', { status: 403, headers: noStore })

  let allowed = isWebOrigin(target)
  for (const table of allowed ? [] : ['products', 'guide_items']) {
    const { data: rows } = await supabase.from(table).select('image_url').in('image_url', [...new Set([raw!, target.href])]).limit(1)
    if (rows && rows.length > 0) {
      allowed = true
      break
    }
  }
  if (!allowed) return new Response('Prohibido', { status: 403, headers: noStore })

  try {
    const upstream = await fetch(target.href, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !upstream.body || !isSafeImageType(type)) {
      return new Response('Imagen no disponible', { status: 502, headers: noStore })
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch {
    return new Response('Imagen no disponible', { status: 502, headers: noStore })
  }
}
