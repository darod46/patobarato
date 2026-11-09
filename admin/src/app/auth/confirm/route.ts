import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../lib/supabase/server'

const TYPES = ['invite', 'recovery'] as const

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = TYPES.find((t) => t === searchParams.get('type'))
  const fail = () => NextResponse.redirect(new URL('/login?error=enlace', origin))
  if (!tokenHash || !type) return fail()

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) return fail()
  return NextResponse.redirect(new URL('/cuenta/contrasena', origin))
}
