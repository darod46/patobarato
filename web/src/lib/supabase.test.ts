import { expect, it, vi } from 'vitest'
import { getSupabase } from './supabase'

it('throws a clear Spanish error when env vars are missing', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  expect(() => getSupabase()).toThrow('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
  vi.unstubAllEnvs()
})
