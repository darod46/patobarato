import type { Metadata } from 'next'
import { discountPercent, formatPrice } from './format'
import { eventPath, eventYear } from './events'
import { guidePath } from './guides'
import { storeInfo } from './stores'
import { stripMarkdown } from './text'
import type { StoreStats } from './stores-data'
import type { Deal, Guide, SiteEvent } from './types'
import { SITE_URL, parseTagParam, productPath, tagPath } from './urls'

export const MAX_DESCRIPTION = 160
/** Hashtag pages with fewer deals than this are kept out of the index. */
export const MIN_INDEXABLE_DEALS = 3

const NOINDEX = { index: false, follow: true }

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
  const tail = `: ${formatPrice(deal.price)}${before} en ${storeInfo(deal.store).name}.${coupon}`
  // The title gives way first; the tail is cut only when it alone is too long (very long coupon).
  const title = truncate(deal.title, Math.max(20, MAX_DESCRIPTION - tail.length))
  return truncate(`${title}${tail}`, MAX_DESCRIPTION)
}

export function productMetadata(deal: Deal): Metadata {
  const discount = dealDiscount(deal)
  const title = `${deal.title} por ${formatPrice(deal.price)}${discount !== null ? ` (-${discount}%)` : ''} · PatoBarato`
  const description = productDescription(deal)
  const path = productPath(deal)
  const images = deal.imageUrl ? [{ url: deal.imageUrl, alt: deal.title }] : [OG_IMAGE]
  return {
    title,
    description,
    alternates: { canonical: path },
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
      availability: 'https://schema.org/InStock',
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

export function hashtagMetadata(tag: string, count: number): Metadata {
  const title = `Chollos de ${tag} · PatoBarato`
  const description = `Los últimos chollos de #${tag} en Amazon, cazados por PatoBarato con su precio, el precio anterior y el cupón si lo hay.`
  const path = tagPath(tag)
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'PatoBarato',
      locale: 'es_ES',
      url: path,
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(count < MIN_INDEXABLE_DEALS && { robots: NOINDEX }),
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
    alternates: { canonical: '/' },
  }
}

/**
 * `/chollos` metadata: a fixed title, the same store-honest description as the home, canonical on
 * `/chollos` (or the hashtag page for a legacy `?tag=`).
 */
export function dealsMetadata(params: { tag?: string; stores?: StoreStats[] }): Metadata {
  const tag = params.tag ? parseTagParam(params.tag) : null
  const stores = params.stores ?? []
  const title = 'Chollos de hoy · PatoBarato'
  const description = stores.length
    ? storeCopy(stores).description
    : 'Los últimos chollos cazados por PatoBarato, con su precio, el precio anterior y el cupón si lo hay.'
  const path = tag ? tagPath(tag) : '/chollos'
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

/** `/buscar`: canonical on itself; any search is `noindex`. */
export function searchMetadata(q: string | null): Metadata {
  const title = 'Buscar chollos · PatoBarato'
  const description = 'Busca un producto y compara los chollos de PatoBarato, AliExpress y las tiendas con las que trabajamos.'
  return {
    title,
    description,
    alternates: { canonical: '/buscar' },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/buscar', title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(q?.trim() ? { robots: NOINDEX } : {}),
  }
}

export function storeMetadata(store: string, deals: number): Metadata {
  const { name, slug } = storeInfo(store)
  const title = `Chollos de ${name} · PatoBarato`
  const description = `Los últimos chollos y cupones de ${name} cazados por PatoBarato, con su precio, el precio anterior y el cupón si lo hay.`
  const path = `/tiendas/${slug}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(deals < MIN_INDEXABLE_DEALS && { robots: NOINDEX }),
  }
}

/** `/tiendas` index; with a single store with data there is nothing to choose, so it stays out of the index. */
export function storesMetadata(count: number): Metadata {
  const title = 'Tiendas · PatoBarato'
  const description = 'Las tiendas de las que PatoBarato publica chollos y cupones, con lo que hay ahora en cada una.'
  return {
    title,
    description,
    alternates: { canonical: '/tiendas' },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/tiendas', title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(count < 2 && { robots: NOINDEX }),
  }
}

export function couponsMetadata(count: number): Metadata {
  const title = 'Cupones vigentes · PatoBarato'
  const description = 'Códigos de descuento vigentes, con sus condiciones y caducidad, comprobados por PatoBarato.'
  return {
    title,
    description,
    alternates: { canonical: '/cupones' },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/cupones', title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(count === 0 && { robots: NOINDEX }),
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
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'article', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(!indexable && { robots: NOINDEX }),
  }
}

export function guidesMetadata(count: number): Metadata {
  const title = 'Guías de compra · PatoBarato'
  const description = 'Guías de compra con los mejores productos, sus precios revisados y los cupones que aplican, por PatoBarato.'
  return {
    title,
    description,
    alternates: { canonical: '/guias' },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/guias', title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(count === 0 && { robots: NOINDEX }),
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
  const data: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.title,
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
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

export function eventsMetadata(): Metadata {
  const title = 'Eventos de compras: Black Friday, 11.11, Cyber Monday | PatoBarato'
  const description = 'El calendario de eventos de compras del año, con sus fechas, los chollos y los cupones de cada uno.'
  return {
    title,
    description,
    alternates: { canonical: '/eventos' },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: '/eventos', title, description, images: [OG_IMAGE] },
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
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'PatoBarato', locale: 'es_ES', url: path, title: full, description, images: [OG_IMAGE] },
  }
}
