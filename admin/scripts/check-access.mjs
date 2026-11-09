// Checks that a signed-in user who is NOT in admin_users gets nothing from the admin tables.
// Needs CHECK_EMAIL / CHECK_PASSWORD (such a user) plus the Supabase URL and anon key, read the same
// way as web/scripts/check-views.mjs (env vars or web/.env.local). Run after applying migrations:
//   CHECK_EMAIL=... CHECK_PASSWORD=... node admin/scripts/check-access.mjs
import { readFileSync } from 'node:fs'

function env() {
  const vars = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../../web/.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (m && !(m[1] in vars)) vars[m[1]] = m[2]
    }
  } catch {}
  const url = vars.NEXT_PUBLIC_SUPABASE_URL || vars.VITE_SUPABASE_URL
  const key = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!vars.CHECK_EMAIL || !vars.CHECK_PASSWORD) throw new Error('missing CHECK_EMAIL / CHECK_PASSWORD')
  return { url, key, email: vars.CHECK_EMAIL, password: vars.CHECK_PASSWORD }
}

const { url, key, email, password } = env()

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const session = await login.json().catch(() => null)
if (!login.ok || !session?.access_token) throw new Error(`sign-in failed: HTTP ${login.status}`)

const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
const problems = []

for (const t of ['coupons', 'publications', 'admin_jobs']) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers })
  const body = await r.json().catch(() => null)
  const denied = [401, 403].includes(r.status)
  const empty = r.status === 200 && Array.isArray(body) && body.length === 0
  if (!denied && !empty) problems.push(`${t}: HTTP ${r.status} with data visible to a non-admin`)
}

const ins = await fetch(`${url}/rest/v1/admin_jobs`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ type: 'revalidate', payload: {} }),
})
if (ins.ok) problems.push(`admin_jobs insert accepted for a non-admin (HTTP ${ins.status})`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('OK')
