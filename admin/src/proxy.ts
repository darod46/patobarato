import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getMembership } from './lib/membership'

const PUBLIC_PATHS = ['/login', '/recuperar']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname === '/auth' || pathname.startsWith('/auth/')
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  // Validates the token with Supabase and refreshes the session cookies when needed.
  const { data } = await supabase.auth.getUser()

  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url))
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie)
    return res
  }

  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return response
  if (!data.user) return redirect('/login')

  // Setting a password right after an invitation must work before anything else.
  if (pathname === '/sin-acceso' || pathname === '/cuenta/contrasena') return response
  const membership = await getMembership(supabase)
  if (!membership) return redirect('/sin-acceso')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
