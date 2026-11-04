import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

/** Lazily creates the Supabase client (anon key only) so importing never requires env vars. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
    }
    client = createClient(url, anonKey)
  }
  return client
}
