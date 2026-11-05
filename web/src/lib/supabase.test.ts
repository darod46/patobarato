import { expect, it, vi } from 'vitest'
import { getSupabase } from './supabase'

it('throws a clear Spanish error when env vars are missing', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  expect(() => getSupabase()).toThrow('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY (o sus equivalentes VITE_*)')
  vi.unstubAllEnvs()
})
