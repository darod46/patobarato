#!/usr/bin/env node
// Builds a Supabase migration from content/guides/*.json (one guide per file) and
// content/guides/_calendar.json (publication days). Idempotent: guides upsert by slug and
// their items are replaced. Usage: node scripts/build-guides-migration.mjs [contentDir] [header] > supabase/migrations/<version>_guides_calendar.sql
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DEFAULT_DIR = join(process.cwd(), 'content', 'guides')
const DEFAULT_HEADER = '-- Guías programadas: 24 guías de compra, una cada lunes (generado por scripts/build-guides-migration.mjs).'
const TAG = '$pb$'

/** 07:00 Europe/Madrid for a calendar day: CET (UTC+1) until the last Sunday of March, CEST (UTC+2) after. */
export function publishedAt(day) {
  const [y, m, d] = day.split('-').map(Number)
  const lastSundayMarch = new Date(Date.UTC(y, 2, 31))
  lastSundayMarch.setUTCDate(31 - lastSundayMarch.getUTCDay())
  const lastSundayOctober = new Date(Date.UTC(y, 9, 31))
  lastSundayOctober.setUTCDate(31 - lastSundayOctober.getUTCDay())
  const date = new Date(Date.UTC(y, m - 1, d))
  const summer = date >= lastSundayMarch && date < lastSundayOctober
  return `${day}T${summer ? '05' : '06'}:00:00Z`
}

function q(text) {
  // Any $ is rejected: a text ending in '$pb' or starting with 'pb$' would also close the quote early.
  if (text.includes('$')) throw new Error(`text contains $ (it could close the ${TAG} quote)`)
  return `${TAG}${text}${TAG}`
}
const arr = (items) => `array[${items.map(q).join(', ')}]::text[]`
const json = (value) => `${q(JSON.stringify(value))}::jsonb`

function storeSql(item, bySlug) {
  const itemId = `(select i.id from guide_items i where i.guide_id = ${bySlug} and i.position = ${item.position})`
  if (!item.stores) {
    return [
      `insert into guide_item_stores (guide_item_id, store, external_id, url, position)`,
      `values (${itemId}, 'amazon', ${q(item.asin)}, ${q(`https://www.amazon.es/dp/${item.asin}`)}, 0);`,
    ]
  }
  return item.stores.flatMap((s, i) => [
    `insert into guide_item_stores (guide_item_id, store, external_id, url, note, position)`,
    `values (${itemId}, ${q(s.store)}, ${q(s.external_id)}, ${q(s.url)}, ${s.note ? q(s.note) : 'null'}, ${i});`,
  ])
}

export function guideSql(entry, guide) {
  if (guide.title.length > 60) throw new Error(`${guide.slug}: title longer than 60 chars`)
  if (guide.widget && guide.widget !== 'neumaticos') throw new Error(`${guide.slug}: unknown widget ${guide.widget}`)
  for (const it of guide.items) {
    if (!it.asin && !(Array.isArray(it.stores) && it.stores.length > 0)) throw new Error(`${guide.slug}: item ${it.position} has neither asin nor stores`)
  }
  const [minItems, maxItems] = guide.widget ? [0, 5] : [4, 5]
  if (guide.items.length < minItems || guide.items.length > maxItems) throw new Error(`${guide.slug}: ${guide.items.length} items`)
  const day = entry.day ?? entry.monday
  const widgetCol = guide.widget ? ', widget' : ''
  const widgetVal = guide.widget ? `, ${q(guide.widget)}` : ''
  const widgetSet = guide.widget ? ', widget = excluded.widget' : ''
  const bySlug = `(select id from guides where slug = ${q(guide.slug)})`
  const lines = [
    `-- ${entry.week}. ${guide.slug} → ${day}`,
    `insert into guides (slug, title, subtitle, category, intro_md, how_to_choose_md, faq, reading_minutes, status, published_at${widgetCol})`,
    `values (${q(guide.slug)}, ${q(guide.title)}, ${q(guide.subtitle)}, ${q(guide.category)}, ${q(guide.intro_md)}, ${q(guide.how_to_choose_md)}, ${json(guide.faq)}, ${guide.reading_minutes}, 'published', ${q(publishedAt(day))}::timestamptz${widgetVal})`,
    `on conflict (slug) do update set title = excluded.title, subtitle = excluded.subtitle, category = excluded.category, intro_md = excluded.intro_md, how_to_choose_md = excluded.how_to_choose_md, faq = excluded.faq, reading_minutes = excluded.reading_minutes, status = 'published', published_at = excluded.published_at${widgetSet}, updated_at = now();`,
    `delete from guide_items where guide_id = ${bySlug};`,
  ]
  for (const item of [...guide.items].sort((a, b) => a.position - b.position)) {
    lines.push(
      `insert into guide_items (guide_id, position, name, award, summary_md, pros, cons, specs)`,
      `values (${bySlug}, ${item.position}, ${q(item.name)}, ${q(item.award)}, ${q(item.summary_md)}, ${arr(item.pros)}, ${arr(item.cons)}, ${json(item.specs)});`,
      ...storeSql(item, bySlug),
    )
  }
  return lines.join('\n')
}

export function build(dir = DEFAULT_DIR, header = DEFAULT_HEADER) {
  const calendar = JSON.parse(readFileSync(join(dir, '_calendar.json'), 'utf8'))
  const out = [header.startsWith('--') ? header : `-- ${header}`, '']
  const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')))
  for (const entry of calendar) {
    const file = `${entry.slug}.json`
    if (!files.has(file)) throw new Error(`missing ${dir}/${file}`)
    const guide = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    if (guide.slug !== entry.slug) throw new Error(`${file}: slug mismatch`)
    out.push(guideSql(entry, guide), '')
  }
  return out.join('\n')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const [dir, header] = process.argv.slice(2)
  process.stdout.write(build(dir ? resolve(dir) : undefined, header))
}
