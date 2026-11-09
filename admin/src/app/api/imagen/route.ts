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

function isWebOrigin(target: URL): boolean {
  const web = parseHttp(process.env.NEXT_PUBLIC_WEB_URL ?? null)
  return web !== null && web.origin === target.origin
}

/** Authenticated same-origin proxy for store images (cross-origin images cannot be copied from the browser). */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return new Response('No autorizado', { status: 401, headers: noStore })

  const target = parseHttp(new URL(request.url).searchParams.get('url'))
  if (!target) return new Response('URL no válida', { status: 400, headers: noStore })

  let allowed = isWebOrigin(target)
  for (const table of allowed ? [] : ['products', 'guide_items']) {
    const { data: rows } = await supabase.from(table).select('image_url').eq('image_url', target.href).limit(1)
    if (rows && rows.length > 0) {
      allowed = true
      break
    }
  }
  if (!allowed) return new Response('Prohibido', { status: 403, headers: noStore })

  try {
    const upstream = await fetch(target.href, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !upstream.body || !type.toLowerCase().startsWith('image/')) {
      return new Response('Imagen no disponible', { status: 502, headers: noStore })
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' },
    })
  } catch {
    return new Response('Imagen no disponible', { status: 502, headers: noStore })
  }
}
