import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonList } from './guides-data'
import { storeInfo, storeNames } from './stores'
import { joinNames } from './text'
import type { PageCopy, PageCopyKind } from './types'

type PageCopyRow = {
  kind: PageCopyKind
  slug: string
  title: string
  h1: string
  intro_md: string
  faq: unknown
  updated_at: string
}

export type CopyValues = { deals?: number | null; stores?: string[] }

const SUFFIX = ' · PatoBarato'

function toCopy(row: PageCopyRow): PageCopy {
  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    h1: row.h1,
    introMd: row.intro_md,
    faq: jsonList<{ q: string; a_md: string }>(row.faq).map((f) => ({ q: f.q, aMd: f.a_md })),
    updatedAt: row.updated_at,
  }
}

/** The published copy of one page, or null when there is none. Throws when the read fails. */
export async function fetchPageCopy(client: SupabaseClient, kind: PageCopyKind, slug: string): Promise<PageCopy | null> {
  const { data, error } = await client.from('web_page_copy').select('*').eq('kind', kind).eq('slug', slug).limit(1)
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as PageCopyRow[])[0]
  return row ? toCopy(row) : null
}

/** All published copies of a kind. */
export async function fetchPageCopies(client: SupabaseClient, kind: PageCopyKind): Promise<PageCopy[]> {
  const { data, error } = await client.from('web_page_copy').select('*').eq('kind', kind)
  if (error) throw new Error(error.message)
  return ((data ?? []) as PageCopyRow[]).map(toCopy)
}

function hasDeals(deals: number | null | undefined): deals is number {
  return typeof deals === 'number' && Number.isFinite(deals)
}

/** Splits a line into sentences (ending in . ! ? before whitespace or end), each keeping its trailing whitespace. */
function sentences(line: string): string[] {
  return line.match(/(?:[^.!?]|[.!?](?!\s|$))*[.!?]+(?:\s+|$)|(?:[^.!?]|[.!?](?!\s|$))+$/g) ?? [line]
}

/**
 * Fills the {deals} and {stores} markers. A sentence whose marker has no value (null, undefined, empty list)
 * is removed entirely; paragraphs, lists and headings are otherwise kept.
 */
export function renderCopy(introMd: string, values: CopyValues): string {
  const dealsText = hasDeals(values.deals) ? values.deals.toLocaleString('es-ES') : null
  const storesText = values.stores && values.stores.length > 0 ? joinNames(storeNames(values.stores)) : null
  const fill = (s: string) => s.replace(/\{deals\}/g, dealsText ?? '').replace(/\{stores\}/g, storesText ?? '')

  const lines: string[] = []
  for (const line of introMd.split('\n')) {
    if (line.trim() === '') {
      lines.push(line)
      continue
    }
    const kept = sentences(line).filter((s) => !((s.includes('{deals}') && dealsText === null) || (s.includes('{stores}') && storesText === null)))
    if (kept.length > 0) lines.push(fill(kept.join('')).trimEnd())
  }
  let out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (values.deals === 1) {
    out = out.replace(/\b1 chollos activos\b/g, '1 chollo activo').replace(/\b1 chollos\b/g, '1 chollo').replace(/\b1 ofertas\b/g, '1 oferta')
  }
  return out
}

const STATIC_TITLES: Record<string, string> = {
  tiendas: 'Tiendas con chollos',
  cupones: 'Cupones de descuento vigentes',
  guias: 'Guías de compra',
  eventos: 'Eventos de compras: Black Friday, 11.11, Cyber Monday',
  'sobre-nosotros': 'Quiénes somos y cómo elegimos los chollos',
}

function offers(n: number): string {
  return n === 1 ? '1 oferta' : `${n.toLocaleString('es-ES')} ofertas`
}

/** `<title>` without the brand suffix, used when the page has no published copy. */
export function defaultTitle(kind: PageCopyKind, slug: string, values: CopyValues): string {
  const n = hasDeals(values.deals) && values.deals > 0 ? values.deals : null
  if (kind === 'category') return n ? `Chollos de ${slug}: ${offers(n)} hoy` : `Chollos de ${slug}`
  if (kind === 'store') {
    const base = `Chollos de ${storeInfo(slug).short} hoy`
    return n ? `${base}: ${offers(n)}` : base
  }
  if (slug === 'chollos') {
    if (!n) return 'Chollos de hoy'
    const names = values.stores && values.stores.length > 0 ? joinNames(storeNames(values.stores)) : null
    return `Chollos de hoy: ${offers(n)}${names ? ` en ${names}` : ''}`
  }
  return STATIC_TITLES[slug] ?? 'Chollos'
}

/** `h1` used when the page has no published copy. */
export function defaultH1(kind: PageCopyKind, slug: string): string {
  if (kind === 'category') return `Chollos de ${slug}`
  if (kind === 'store') return `Chollos de ${storeInfo(slug).short}`
  return defaultTitle(kind, slug, {})
}

/** Full `<title>`: the copy's title (or the default) plus the brand. */
export function pageTitle(copy: PageCopy | null, kind: PageCopyKind, slug: string, values: CopyValues): string {
  return (copy?.title ?? defaultTitle(kind, slug, values)) + SUFFIX
}
