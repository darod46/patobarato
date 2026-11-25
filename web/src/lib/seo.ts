import type { Metadata } from 'next'
import { discountPercent, formatPrice } from './format'
import { isDealIndexable } from './deals'
import { eventPath, eventYear } from './events'
import { guideCover } from './guide-covers'
import { guidePath } from './guides'
import { storeInfo } from './stores'
import { renderCopy, pageTitle, type CopyValues } from './page-copy'
import { stripMarkdown } from './text'
import type { StoreStats } from './stores-data'
import type { Deal, Guide, PageCopy, PageCopyKind, SiteEvent } from './types'
import { SITE_URL, productPath } from './urls'

export const MAX_DESCRIPTION = 160
/** Category and store pages with fewer deals than this and no editorial copy are kept out of the index. */
export const MIN_INDEXABLE_DEALS = 3

const NOINDEX = { index: false, follow: true }

/** Canonical plus the hreflang alternates (the site is Spanish-only, so every language points at the same path). */
export function withHreflang(path: string): NonNullable<Metadata['alternates']> {
  return { canonical: path, languages: { 'es-ES': path, 'x-default': path } }
}

/** Default Open Graph image; child metadata replaces the layout's `openGraph`, so pages repeat it. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'PatoBarato · El pato que caza los chollos de Amazon antes de que vuelen' }

function dealDiscount(deal: Deal): number | null {
  return deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function productDescription(deal: Deal): string {
  const discount = dealDiscount(deal)
  const before =
    discount !== null ? ` (antes ${formatPrice(deal.previousPrice!)}, -${discount}%)` : ''
  const coupon = deal.coupon ? ` ${deal.coupon}.` : ''
  const price = deal.priceBeforeCoupon
    ? ` por ${formatPrice(deal.price)} sin cupón`
    : `: ${formatPrice(deal.price)}`
  const tail = `${price}${before} en ${storeInfo(deal.store).name}.${coupon}`
  // The title gives way first; the tail is cut only when it alone is too long (very long coupon).
  const title = truncate(deal.title, Math.max(20, MAX_DESCRIPTION - tail.length))
  return truncate(`${title}${tail}`, MAX_DESCRIPTION)
}

function endedDescription(deal: Deal): string {
  const date = new Date(deal.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
  return `Esta oferta de ${storeInfo(deal.store).name} ya ha terminado. Se publicó a ${formatPrice(deal.price)} el ${date}. Mira el precio actual o las ofertas vigentes.`
}

export function productMetadata(deal: Deal, now: Date = new Date()): Metadata {
  const discount = dealDiscount(deal)
  const sinCupon = deal.priceBeforeCoupon ? ' sin cupón' : ''
  const ended = deal.status === 'ended'
  const title = ended
    ? `${deal.title} · Oferta caducada · PatoBarato`
    : `${deal.title} por ${formatPrice(deal.price)}${sinCupon}${discount !== null ? ` (-${discount}%)` : ''} · PatoBarato`
  const description = ended ? endedDescription(deal) : productDescription(deal)
  const path = productPath(deal)
  const images = deal.imageUrl ? [{ url: deal.imageUrl, alt: deal.title }] : [OG_IMAGE]
  return {
    title,
    description,
    alternates: withHreflang(path),
    openGraph: {
      type: 'website',
      siteName: 'PatoBarato',
      locale: 'es_ES',
      url: path,
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: images.map((i) => i.url),
    },
    ...(!isDealIndexable(deal, now) && { robots: NOINDEX }),
  }
}

export function productJsonLd(deal: Deal, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: deal.title,
    ...(deal.imageUrl && { image: deal.imageUrl }),
    sku: deal.asin,
    offers: {
      '@type': 'Offer',
      price: deal.price.toFixed(2),
      priceCurrency: 'EUR',
      availability:
        deal.status === 'ended' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      ...(deal.status === 'ended' && deal.endedAt && { priceValidUntil: deal.endedAt.slice(0, 10) }),
      url,
      seller: { '@type': 'Organization', name: storeInfo(deal.store).name },
    },
  }
}

export type BreadcrumbItem = { name: string; path: string }

export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: SITE_URL + item.path,
    })),
  }
}

/** Honest title/description parts from the stores with data; undefined without stores. */
function storeCopy(stores: StoreStats[]) {
  const coupons = stores.some((s) => s.coupons > 0)
  const others = stores.some((s) => s.store !== 'amazon' && (s.deals > 0 || s.coupons > 0))
  return {
    title: `PatoBarato · Chollos${coupons ? ' y cupones' : ''} de Amazon${others ? ' y otras tiendas' : ''}`,
    description: `Los mejores chollos de Amazon${coupons ? ' y cupones' : ''}${others ? ' de otras tiendas' : ''}, seleccionados cada día por PatoBarato.`,
  }
}

/**
 * Home metadata. With `stores` (those with deals or coupons) the title mentions coupons only if some
 * store has them, and "otras tiendas" only when a non-Amazon store has data — never claim what the data
 * does not show. Without stores the layout's default title stays.
 */
export function homeMetadata(params: { stores?: StoreStats[] }): Metadata {
  const stores = params.stores ?? []
  const { title, description } = storeCopy(stores)
  return {
    ...(stores.length > 0 && { title, description, openGraph: { title, description, images: [OG_IMAGE] } }),
    alternates: withHreflang('/'),
  }
}

export type ListingMeta = {
  kind: PageCopyKind
  slug: string
  path: string
  copy: PageCopy | null
  values: CopyValues
  indexable: boolean
  /** Description used when there is no published copy. */
  fallbackDescription?: string
}

const DEFAULT_DESCRIPTION = 'Los últimos chollos cazados por PatoBarato, con su precio, el precio anterior y el cupón si lo hay.'

/** Metadata of a listing page (category, store or static): published copy first, honest defaults otherwise. */
export function listingMetadata(m: ListingMeta): Metadata {
  const title = pageTitle(m.copy, m.kind, m.slug, m.values)
  const fromCopy = m.copy ? truncate(firstSentence(renderCopy(m.copy.introMd, m.values)), MAX_DESCRIPTION) : ''
  // Copy whose sentences all needed a missing value renders empty: fall back like a page without copy.
  const description = fromCopy || (m.fallbackDescription ?? DEFAULT_DESCRIPTION)
  return {
    title,
    description,
    alternates: withHreflang(m.path),
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: m.path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(!m.indexable && { robots: NOINDEX }),
  }
}

/** AboutPage and Organization structured data for `/sobre-nosotros`. */
export function aboutJsonLd(url: string): Record<string, unknown>[] {
  return [
    { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Sobre PatoBarato', url },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PatoBarato',
      url: SITE_URL,
      sameAs: ['https://t.me/patobarato'],
    },
  ]
}

/** `/buscar`: canonical on itself; any search is `noindex`. */
export function searchMetadata(q: string | null): Metadata {
  const title = 'Buscar chollos · PatoBarato'
  const description = 'Busca un producto y compara los chollos de PatoBarato, AliExpress y las tiendas con las que trabajamos.'
  return {
    title,
    description,
    alternates: withHreflang('/buscar'),
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/buscar', title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(q?.trim() ? { robots: NOINDEX } : {}),
  }
}

export function firstSentence(md: string): string {
  const plain = stripMarkdown(md)
  const m = /^.*?[.!?](?=\s|$)/.exec(plain)
  return truncate(m ? m[0] : plain, MAX_DESCRIPTION)
}

export function guideMetadata(guide: Guide, indexable: boolean): Metadata {
  const title = `${guide.title} · Guías PatoBarato`
  const description = truncate(guide.subtitle ?? firstSentence(guide.introMd), MAX_DESCRIPTION)
  const path = guidePath(guide.slug)
  const cover = guideCover(guide.slug, guide.title)
  const image = cover ?? OG_IMAGE
  return {
    title,
    description,
    alternates: withHreflang(path),
    openGraph: { type: 'article', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
    ...(!indexable && { robots: NOINDEX }),
  }
}

/** FAQPage structured data; answers are plain text. */
export function faqJsonLd(faq: { q: string; aMd: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: stripMarkdown(f.aMd) },
    })),
  }
}

/** Article, ItemList and (when there are questions) FAQPage structured data for a guide page. */
export function guideJsonLd(guide: Guide, url: string): Record<string, unknown>[] {
  const cover = guideCover(guide.slug, guide.title)
  const data: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.title,
      ...(cover && { image: SITE_URL + cover.url }),
      author: { '@type': 'Organization', name: 'PatoBarato' },
      datePublished: guide.publishedAt,
      dateModified: guide.updatedAt,
      mainEntityOfPage: url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: guide.items.map((it) => ({
        '@type': 'ListItem',
        position: it.position,
        name: it.name,
        url: `${url}#producto-${it.position}`,
      })),
    },
  ]
  if (guide.faq.length > 0) {
    data.push(faqJsonLd(guide.faq))
  }
  return data
}

function eventDescription(event: SiteEvent): string {
  return truncate(firstSentence(event.introMd), MAX_DESCRIPTION)
}

export function eventMetadata(event: SiteEvent): Metadata {
  const title = `${event.name} ${eventYear(event)}: chollos, cupones y consejos | PatoBarato`
  const description = eventDescription(event)
  const path = eventPath(event.slug)
  return {
    title,
    description,
    alternates: withHreflang(path),
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

/** Event structured data; null when the dates are approximate (never claim dates we are unsure of). */
export function eventJsonLd(event: SiteEvent, url: string): Record<string, unknown> | null {
  if (event.approximate) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${event.name} ${eventYear(event)}`,
    startDate: event.startsOn,
    endDate: event.endsOn,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url },
    organizer: { '@type': 'Organization', name: 'PatoBarato', url: SITE_URL },
    description: eventDescription(event),
  }
}

/** WebSite (with sitelinks search box) and Organization structured data for the home page. */
export function siteJsonLd(): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PatoBarato',
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/buscar?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PatoBarato',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
    },
  ]
}

/** Serializes structured data for a ld+json script; "<" is escaped so text can never close the element. */
export function jsonLdScript(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') }
}

/** Metadata for the static text pages (legal, affiliate, contact). */
export function legalMetadata(title: string, path: string, description: string): Metadata {
  const full = `${title} · PatoBarato`
  return {
    title: full,
    description,
    alternates: withHreflang(path),
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title: full, description, images: [OG_IMAGE] },
  }
}
