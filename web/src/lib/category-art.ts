// Amazon's licence only covers product images obtained through its API (Creators API / PA API), and the
// account has no API access until it is approved. Until then the web never shows an Amazon-hosted image:
// Amazon products get the duck illustration of their category instead. Other stores keep their own images
// (AliExpress and Awin images come from their official APIs/feeds).

export const ART_KEYS = ['tecnologia', 'hogar', 'belleza', 'juguetes', 'alimentacion', 'deporte', 'moda', 'bricolaje', 'general'] as const
export type ArtKey = (typeof ART_KEYS)[number]

/** Illustrations present in `public/categorias/<key>.jpeg` (640×640). A key not listed here uses the generic placeholder duck. */
export const CATEGORY_ART_KEYS: ReadonlySet<ArtKey> = new Set<ArtKey>(ART_KEYS)

export const PLACEHOLDER_ART = '/pato-placeholder.svg'

const CATEGORY_KEYS = new Set<string>(ART_KEYS.filter((k) => k !== 'general'))

/** Category of a deal: the product's assigned category, else its first known category hashtag, else `general`. */
export function categoryKey(hashtags: string[], category?: string | null): ArtKey {
  if (category && CATEGORY_KEYS.has(category)) return category as ArtKey
  for (const tag of hashtags) {
    const key = tag.replace(/^#/, '').toLowerCase()
    if (CATEGORY_KEYS.has(key)) return key as ArtKey
  }
  return 'general'
}

/** Category of a guide from its label ("Tecnología", "Hogar"…); categories without art (e.g. Motor) are `general`. */
export function guideArtKey(category: string): ArtKey {
  const key = category
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  return CATEGORY_KEYS.has(key) ? (key as ArtKey) : 'general'
}

/** True for images served by Amazon (m.media-amazon.com, *.images-amazon.com, *.ssl-images-amazon.com). */
export function isAmazonImage(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return /(^|\.)(media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com)$/.test(host)
}

/** The illustration for a category, or the generic placeholder duck while that one does not exist. */
export function categoryArt(key: ArtKey): string {
  return CATEGORY_ART_KEYS.has(key) ? `/categorias/${key}.jpeg` : PLACEHOLDER_ART
}

/** True for one of our category illustrations: shown edge to edge, unlike product photos. */
export function isCategoryArt(url: string | null): boolean {
  return url !== null && url.startsWith('/categorias/')
}

/** The image the web may show: Amazon-hosted images are replaced by the category illustration; the rest pass through. */
export function displayImage(url: string | null, key: ArtKey): string | null {
  if (url === null || url === '') return null
  return isAmazonImage(url) ? categoryArt(key) : url
}
