// Checks, with the public anon key, that the web can read exactly the public views and nothing
// more. Run from `web/` after applying migrations: `node scripts/check-views.mjs`.
import { readFileSync } from 'node:fs'

function env() {
  const vars = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (m && !(m[1] in vars)) vars[m[1]] = m[2]
    }
  } catch {}
  const url = vars.NEXT_PUBLIC_SUPABASE_URL || vars.VITE_SUPABASE_URL
  const key = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return { url, key }
}

const { url, key } = env()
const rest = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const problems = []
const deals = await rest('web_deals?select=*&limit=1')
if (deals.status !== 200) problems.push(`web_deals: HTTP ${deals.status}`)
for (const col of ['discount_pct', 'previous_min_price', 'is_lowest']) {
  if (deals.body?.[0] && !(col in deals.body[0])) problems.push(`web_deals: missing column ${col}`)
}
const coupons = await rest('web_coupons?select=*&limit=1')
if (coupons.status !== 200 || !Array.isArray(coupons.body)) problems.push(`web_coupons: HTTP ${coupons.status}`)
const table = await rest('coupons?select=*&limit=1')
if (table.status === 200) problems.push('coupons table is readable by anon (expected permission denied)')

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('OK')
