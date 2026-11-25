import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, guideSql } from './build-guides-migration.mjs'


const base = {
  slug: 'g', title: 'Titulo', subtitle: 's', category: 'Motor', intro_md: 'i', how_to_choose_md: 'h',
  faq: [], reading_minutes: 3,
}
const item = (extra) => ({ position: 1, name: 'N', award: 'A', summary_md: 'm', pros: ['p'], cons: ['c'], specs: {}, ...extra })

// The applied migration 20261124010000 predates later edits to content/guides (dates and texts), so
// it cannot be compared byte for byte with a fresh build; instead the Amazon SQL shape is pinned.
test('Amazon guides keep the original SQL shape (no widget, no note)', () => {
  const sql = guideSql({ week: 1, monday: '2026-11-23' }, {
    ...base, items: [1, 2, 3, 4].map((position) => item({ position, asin: `B00000000${position}` })),
  })
  assert.ok(sql.includes('insert into guides (slug, title, subtitle, category, intro_md, how_to_choose_md, faq, reading_minutes, status, published_at)\n'))
  assert.ok(!sql.includes('widget'))
  assert.ok(sql.includes(
    "insert into guide_item_stores (guide_item_id, store, external_id, url, position)\n" +
    "values ((select i.id from guide_items i where i.guide_id = (select id from guides where slug = $pb$g$pb$) and i.position = 1), 'amazon', $pb$B000000001$pb$, $pb$https://www.amazon.es/dp/B000000001$pb$, 0);",
  ))
  assert.ok(sql.includes('-- 1. g → 2026-11-23'))
  assert.ok(sql.includes('$pb$2026-11-23T06:00:00Z$pb$::timestamptz)'))
})

test('items with stores write store, url and note', () => {
  const url = 'https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/108+200+201+202+205'
  const sql = guideSql({ week: 2, day: '2026-12-11' }, {
    ...base, widget: 'neumaticos',
    items: [1, 2, 3, 4].map((position) => item({ position, stores: [{ store: 'neumaticos', external_id: `x${position}`, url, note: 'Precio para 205/55 R16' }] })),
  })
  assert.match(sql, /insert into guide_item_stores \(guide_item_id, store, external_id, url, note, position\)/)
  assert.ok(sql.includes('$pb$neumaticos$pb$'))
  assert.ok(sql.includes(`$pb$${url}$pb$`))
  assert.ok(sql.includes('$pb$Precio para 205/55 R16$pb$'))
  assert.ok(sql.includes('2026-12-11T06:00:00Z'))
})

test('widget guide with 0 items is accepted and writes widget', () => {
  const sql = guideSql({ week: 1, day: '2026-12-04' }, { ...base, widget: 'neumaticos', items: [] })
  assert.ok(sql.includes('$pb$neumaticos$pb$'))
  assert.ok(sql.includes('widget = excluded.widget'))
  assert.ok(/guides \([^)]*widget[^)]*\)/.test(sql))
})

test('guide without widget needs 4-5 items and has no widget column', () => {
  assert.throws(() => guideSql({ week: 1, monday: '2026-11-23' }, { ...base, items: [] }), /items/)
})

test('build accepts a content dir and header', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guides-'))
  writeFileSync(join(dir, '_calendar.json'), JSON.stringify([{ week: 1, day: '2026-12-04', slug: 'g' }]))
  writeFileSync(join(dir, 'g.json'), JSON.stringify({ ...base, widget: 'neumaticos', items: [] }))
  const out = build(dir, '-- cabecera')
  assert.equal(out.split('\n')[0], '-- cabecera')
  assert.ok(out.includes('widget = excluded.widget'))
})

test('unknown widget and items without asin or stores are rejected', () => {
  assert.throws(() => guideSql({ week: 1, day: '2026-12-04' }, { ...base, widget: 'neumatikos', items: [] }), /unknown widget/)
  assert.throws(() => guideSql({ week: 1, day: '2026-12-04' }, { ...base, widget: 'neumaticos', items: [item({ stores: [] })] }), /neither asin nor stores/)
  assert.throws(() => guideSql({ week: 1, day: '2026-12-04' }, { ...base, widget: 'neumaticos', items: [item({})] }), /neither asin nor stores/)
})

test('rejects any $ in the text, which could close the $pb$ quote early', () => {
  for (const title of ['cuesta 5$pb', 'pb$ caro', 'precio $pb$']) {
    assert.throws(() => guideSql({ week: 1, monday: '2026-11-23' }, { ...base, title, widget: 'neumaticos', items: [] }), /contains \$/)
  }
})
