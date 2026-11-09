import { discountPercent, formatPrice } from './money'

// Port of bot/src/patobarato/publishing/format.py (keep both in sync: shared/post-format-cases.json pins them).

export type PostInput = {
  title: string
  price: number
  previousPrice: number | null
  coupon: string | null
  hashtags: string[]
  link: string
  storeName: string
  priceBeforeCoupon: boolean
  ended: boolean
}

const LINK_TLDS = 'es|com|net|org|eu|to|ly|co|io|me|gl|link|info|shop|store|de|fr|it|uk'
// Port of URL_RE in bot/src/patobarato/parsing/text.py.
const URL_RE = new RegExp(
  [
    String.raw`https?://\S+`,
    String.raw`\bwww\.\S+`,
    String.raw`\b(?:[a-z0-9-]+\.)+[a-z]{2,}/\S*`,
    String.raw`\b(?:[a-z0-9-]+\.)+(?:${LINK_TLDS})\b(?![.\-])(?:[?#]\S*)?`,
    String.raw`\S*[?&]tag=\S*`,
  ].join('|'),
  'gi',
)
const INVALID_TAG_CHARS = /[^a-z0-9_áéíóúñü]/g

/** Removes every link-like token (with or without scheme) and tidies spaces. */
export function stripUrls(text: string): string {
  return text.replace(URL_RE, ' ').split(/\s+/).filter(Boolean).join(' ')
}

export function normalizeHashtag(tag: string): string {
  return tag.toLowerCase().replace(INVALID_TAG_CHARS, '')
}

export function linkLabel(storeName: string): string {
  return `🛒 Ver en ${storeName}:`
}

/** Python `html.escape(s)` (quote=True). */
function escapeHtml(s: string, quote = true): string {
  const out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return quote ? out.replace(/"/g, '&quot;').replace(/'/g, '&#x27;') : out
}

export function cleanHashtags(hashtags: string[]): string[] {
  return hashtags.map(normalizeHashtag).filter(Boolean)
}

/** Title and coupon as they go in any post: links removed, a link-only coupon dropped. */
export function cleanTitleAndCoupon(p: PostInput): { title: string; coupon: string | null } {
  return { title: stripUrls(p.title), coupon: p.coupon ? stripUrls(p.coupon) || null : null }
}

function build(p: PostInput, title: string, coupon: string | null): string {
  const label = p.priceBeforeCoupon ? 'Precio sin cupón' : 'Precio'
  const price = formatPrice(p.price)
  const lines: string[] = []
  if (p.ended) lines.push('❌ <b>OFERTA TERMINADA</b>')
  lines.push(`<b>${escapeHtml(title)}</b>`)
  lines.push(p.ended ? `✅ ${label}: <s>${price} €</s>` : `✅ ${label}: <b>${price} €</b>`)
  if (p.previousPrice !== null) {
    lines.push(`❌ Antes: <s>${formatPrice(p.previousPrice)} €</s> (-${discountPercent(p.price, p.previousPrice)}%)`)
  }
  if (coupon) lines.push(`🎟️ Cupón: <code>${escapeHtml(coupon)}</code>`)
  lines.push(`${linkLabel(p.storeName)} ${escapeHtml(p.link, false)}`)
  const tags = cleanHashtags(p.hashtags)
  if (tags.length) {
    lines.push('')
    lines.push(tags.map((t) => `#${t}`).join(' '))
  }
  return lines.join('\n')
}

// Python len() counts code points, JS .length counts UTF-16 units.
const len = (s: string) => [...s].length

/** HTML caption for Telegram (also the preview), trimmed to 1024 code points by shortening only the title. */
export function telegramCaption(p: PostInput, maxLen = 1024): string {
  const { title, coupon } = cleanTitleAndCoupon(p)
  const caption = build(p, title, coupon)
  if (len(caption) <= maxLen) return caption
  const chars = [...title]
  const trimmed = (n: number) => chars.slice(0, n).join('').trimEnd() + '…'
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (len(build(p, trimmed(mid), coupon)) <= maxLen) lo = mid
    else hi = mid - 1
  }
  return build(p, trimmed(lo), coupon)
}
