import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

/** Lazily creates the Supabase client (anon key only) so importing never requires env vars. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    // Accessed by full name so Next.js inlines them into the client bundle.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY (o sus equivalentes VITE_*)')
    }
    client = createClient(url, anonKey)
  }
  return client
}
