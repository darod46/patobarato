import { fetchEvents } from '../../../lib/events-data'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Checks = {
  supabase: 'ok' | 'error'
  errorName?: string
  deals: number | null
  events: number | null
}

/** Health check: always answers 200; never exposes URLs, keys or error messages. */
export async function GET(): Promise<Response> {
  let checks: Checks
  try {
    const client = getSupabase()
    const [stores, events] = await Promise.all([fetchStores(client), fetchEvents(client)])
    checks = {
      supabase: 'ok',
      deals: stores.reduce((sum, s) => sum + s.deals, 0),
      events: events.length,
    }
  } catch (error) {
    checks = {
      supabase: 'error',
      errorName: error instanceof Error ? error.name : 'Error',
      deals: null,
      events: null,
    }
  }
  return Response.json(
    { ok: checks.supabase === 'ok', at: new Date().toISOString(), checks },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
