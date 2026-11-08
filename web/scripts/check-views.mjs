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
for (const col of ['discount_pct', 'previous_min_price', 'is_lowest', 'price_before_coupon']) {
  if (deals.body?.[0] && !(col in deals.body[0])) problems.push(`web_deals: missing column ${col}`)
}
const coupons = await rest('web_coupons?select=*&limit=1')
if (coupons.status !== 200 || !Array.isArray(coupons.body)) problems.push(`web_coupons: HTTP ${coupons.status}`)
if (coupons.body?.[0] && !('event_id' in coupons.body[0])) problems.push('web_coupons: missing column event_id')
const table = await rest('coupons?select=*&limit=1')
if (table.status === 200) problems.push('coupons table is readable by anon (expected permission denied)')
const stores = await rest('web_stores?select=*&limit=1')
if (stores.status !== 200) problems.push(`web_stores: HTTP ${stores.status}`)
for (const col of ['store', 'deals', 'coupons']) {
  if (stores.body?.[0] && !(col in stores.body[0])) problems.push(`web_stores: missing column ${col}`)
}
const sources = await rest('sources?select=*&limit=1')
if (sources.status === 200) problems.push('sources table is readable by anon (expected permission denied)')

for (const view of ['web_guides', 'web_guide_items', 'web_guides_by_product']) {
  const r = await rest(`${view}?select=*&limit=1`)
  if (r.status !== 200 || !Array.isArray(r.body)) problems.push(`${view}: HTTP ${r.status}`)
}
for (const t of ['guides', 'guide_items', 'guide_item_stores', 'product_prices']) {
  const r = await rest(`${t}?select=*&limit=1`)
  if (![401, 403].includes(r.status)) problems.push(`${t} table: HTTP ${r.status} (expected 401/403)`)
}

for (const t of ['catalog_products', 'catalog_feeds']) {
  const r = await rest(`${t}?select=*&limit=1`)
  if (![401, 403].includes(r.status)) problems.push(`${t} table: HTTP ${r.status} (expected 401/403)`)
}
const search = await fetch(`${url}/rest/v1/rpc/web_catalog_search`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ q: 'xx' }),
})
const searchBody = await search.json().catch(() => null)
if (search.status !== 200 || !Array.isArray(searchBody)) problems.push(`web_catalog_search: HTTP ${search.status}`)

for (const view of ['web_events', 'web_event_promos']) {
  const r = await rest(`${view}?select=*&limit=1`)
  if (r.status !== 200 || !Array.isArray(r.body)) problems.push(`${view}: HTTP ${r.status}`)
}
for (const t of ['events', 'event_promos']) {
  const r = await rest(`${t}?select=*&limit=1`)
  if (r.status === 200) problems.push(`${t} table is readable by anon (expected permission denied)`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('OK')
