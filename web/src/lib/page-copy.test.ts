import { describe, expect, it } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import { defaultH1, defaultTitle, fetchPageCopies, fetchPageCopy, pageTitle, renderCopy } from './page-copy'
import type { PageCopy } from './types'

const row = {
  kind: 'category',
  slug: 'tecnologia',
  title: 'Chollos de tecnología',
  h1: 'Chollos de tecnología hoy',
  intro_md: 'Intro',
  faq: [{ q: 'Q1', a_md: 'A1' }],
  updated_at: '2026-11-22T00:00:00Z',
}

describe('renderCopy', () => {
  it('replaces markers', () =>
    expect(renderCopy('Hoy hay {deals} chollos en {stores}.', { deals: 1234, stores: ['amazon', 'aliexpress'] })).toBe(
      'Hoy hay 1234 chollos en Amazon y AliExpress.',
    ))
  it('drops the sentence when a marker has no value', () =>
    expect(renderCopy('Primera. Hoy hay {deals} chollos. Última.', { deals: null })).toBe('Primera. Última.'))
  it('drops a first sentence ending in ! and keeps the paragraph', () =>
    expect(renderCopy('¡Hay {deals} chollos! Sigue.\n\n- lista', {})).toBe('Sigue.\n\n- lista'))
  it('drops a whole paragraph and list item without leaving blank gaps', () =>
    expect(renderCopy('A.\n\nHoy hay {deals} chollos.\n\nB.\n\n- uno\n- Hay {deals}.\n- tres', {})).toBe('A.\n\nB.\n\n- uno\n- tres'))
  it('treats an empty stores array as no value', () =>
    expect(renderCopy('Antes. Hoy hay chollos en {stores}. Después.', { stores: [] })).toBe('Antes. Después.'))
  it('never leaves a literal marker', () => expect(renderCopy('{deals} {stores}', {})).not.toMatch(/\{deals\}|\{stores\}/))
  it('keeps decimals inside a sentence', () => expect(renderCopy('Vale 3.5 euros y {deals}.', { deals: 2 })).toBe('Vale 3.5 euros y 2.'))
  it('uses the singular when there is exactly one deal', () => {
    expect(renderCopy('Seguimos {deals} chollos activos en esta categoría.', { deals: 1 })).toBe('Seguimos 1 chollo activo en esta categoría.')
    expect(renderCopy('Hay {deals} chollos hoy.', { deals: 1 })).toBe('Hay 1 chollo hoy.')
    expect(renderCopy('Hay {deals} ofertas hoy.', { deals: 1 })).toBe('Hay 1 oferta hoy.')
    expect(renderCopy('Hay {deals} chollos hoy.', { deals: 11 })).toBe('Hay 11 chollos hoy.')
  })
})

describe('default titles', () => {
  it('builds titles per kind, with the number segment only when positive', () => {
    expect(defaultTitle('category', 'tecnologia', { deals: 23 })).toBe('Chollos de tecnologia: 23 ofertas hoy')
    expect(defaultTitle('category', 'tecnologia', {})).toBe('Chollos de tecnologia')
    expect(defaultTitle('store', 'amazon', { deals: 0 })).toBe('Chollos de Amazon hoy')
    expect(defaultTitle('store', 'amazon', { deals: 12 })).toBe('Chollos de Amazon hoy: 12 ofertas')
    expect(defaultTitle('static', 'chollos', { deals: 315, stores: ['amazon', 'aliexpress'] })).toBe('Chollos de hoy: 315 ofertas en Amazon y AliExpress')
    expect(defaultTitle('static', 'chollos', { deals: 315 })).toBe('Chollos de hoy: 315 ofertas')
    expect(defaultTitle('static', 'chollos', {})).toBe('Chollos de hoy')
    expect(defaultTitle('static', 'sobre-nosotros', {})).toBe('Quiénes somos y cómo elegimos los chollos')
    expect(defaultTitle('static', 'tiendas', {})).toBe('Tiendas con chollos')
  })
  it('builds h1 defaults', () => {
    expect(defaultH1('category', 'hogar')).toBe('Chollos de hogar')
    expect(defaultH1('store', 'amazon')).toBe('Chollos de Amazon')
    expect(defaultH1('static', 'cupones')).toBe('Cupones de descuento vigentes')
  })
  it('pageTitle prefers the copy title and appends the brand', () => {
    const copy = { title: 'Mi título' } as PageCopy
    expect(pageTitle(copy, 'category', 'hogar', { deals: 3 })).toBe('Mi título · PatoBarato')
    expect(pageTitle(null, 'category', 'hogar', {})).toBe('Chollos de hogar · PatoBarato')
  })
})

describe('fetchPageCopy', () => {
  it('maps a row and queries by kind and slug', async () => {
    const f = fakeClient({ data: [row], error: null })
    const copy = await fetchPageCopy(f.client, 'category', 'tecnologia')
    expect(f.calls).toContainEqual(['from', ['web_page_copy']])
    expect(f.calls).toContainEqual(['eq', ['kind', 'category']])
    expect(f.calls).toContainEqual(['eq', ['slug', 'tecnologia']])
    expect(f.calls).toContainEqual(['limit', [1]])
    expect(copy).toEqual({
      kind: 'category',
      slug: 'tecnologia',
      title: 'Chollos de tecnología',
      h1: 'Chollos de tecnología hoy',
      introMd: 'Intro',
      faq: [{ q: 'Q1', aMd: 'A1' }],
      updatedAt: '2026-11-22T00:00:00Z',
    })
  })
  it('returns null when absent and throws on error', async () => {
    expect(await fetchPageCopy(fakeClient({ data: [], error: null }).client, 'store', 'x')).toBeNull()
    await expect(fetchPageCopy(fakeClient({ data: null, error: { message: 'boom' } }).client, 'store', 'x')).rejects.toThrow('boom')
  })
  it('lists copies of a kind', async () => {
    const f = fakeClient({ data: [row, { ...row, slug: 'hogar', faq: '[]' }], error: null })
    const all = await fetchPageCopies(f.client, 'category')
    expect(f.calls).toContainEqual(['eq', ['kind', 'category']])
    expect(all.map((c) => [c.slug, c.faq.length])).toEqual([['tecnologia', 1], ['hogar', 0]])
  })
})
