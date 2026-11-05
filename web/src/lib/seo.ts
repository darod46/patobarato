import type { Metadata } from 'next'
import { discountPercent, formatPrice } from './format'
import { storeInfo } from './stores'
import type { Deal } from './types'
import { SITE_URL, parseTagParam, productPath, tagPath } from './urls'

const MAX_DESCRIPTION = 160
/** Hashtag pages with fewer deals than this are kept out of the index. */
export const MIN_INDEXABLE_DEALS = 3

const NOINDEX = { index: false, follow: true }

/** Default Open Graph image; child metadata replaces the layout's `openGraph`, so pages repeat it. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'PatoBarato · chollos de Amazon' }

function dealDiscount(deal: Deal): number | null {
  return deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
}

function truncate(text: string, max: number): string {
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
  const description = `Los últimos chollos de #${tag} en Amazon, seleccionados por PatoBarato.`
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

/** Home metadata for the v1 query links: `?tag=` is canonical on its hashtag page, `?q=` is never indexed. */
export function homeMetadata(params: { q?: string; tag?: string }): Metadata {
  const tag = params.tag ? parseTagParam(params.tag) : null
  return {
    alternates: { canonical: tag ? tagPath(tag) : '/' },
    ...(params.q?.trim() ? { robots: NOINDEX } : {}),
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
        target: `${SITE_URL}/?q={search_term_string}`,
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
