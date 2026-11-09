import { discountPercent, formatPrice } from './money'
import { storeName } from './stores'
import { cleanHashtags, cleanTitleAndCoupon, linkLabel, type PostInput } from './telegram-format'

/** WhatsApp text of an offer: same lines and order as the Telegram caption. */
export function whatsappOffer(p: PostInput): string {
  const { title, coupon } = cleanTitleAndCoupon(p)
  const label = p.priceBeforeCoupon ? 'Precio sin cupón' : 'Precio'
  const price = formatPrice(p.price)
  const lines: string[] = []
  if (p.ended) lines.push('❌ *OFERTA TERMINADA*')
  lines.push(`*${title}*`)
  lines.push(p.ended ? `✅ ${label}: ~${price} €~` : `✅ ${label}: *${price} €*`)
  if (p.previousPrice !== null) {
    lines.push(`❌ Antes: ~${formatPrice(p.previousPrice)} €~ (-${discountPercent(p.price, p.previousPrice)}%)`)
  }
  if (coupon) lines.push(`🎟️ Cupón: \`${coupon}\``)
  lines.push(`${linkLabel(p.storeName)} ${p.link}`)
  const tags = cleanHashtags(p.hashtags)
  if (tags.length) lines.push('', tags.map((t) => `#${t}`).join(' '))
  return lines.join('\n')
}

const madridDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function whatsappCoupon(c: {
  store: string
  title: string
  code: string
  conditions: string | null
  expiresAt: string | null
  url: string
}): string {
  const lines = [`🎟️ *${c.title}*`, `Tienda: ${storeName(c.store)}`, `Código: \`${c.code}\``]
  if (c.conditions) lines.push(c.conditions)
  if (c.expiresAt) lines.push(`Caduca el ${madridDate.format(new Date(c.expiresAt))}`)
  lines.push(c.url)
  return lines.join('\n')
}

export function whatsappGuide(g: { title: string; subtitle: string; slug: string }, webUrl: string): string {
  return [`📖 *${g.title}*`, g.subtitle, '', `${webUrl}/guias/${g.slug}`].join('\n')
}

/** First paragraph of a Markdown text as plain text (common Markdown removed, no dependency). */
export function firstParagraphPlain(md: string): string {
  const first = md.split(/\n\s*\n/).find((part) => part.trim()) ?? ''
  return first
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

export function whatsappEvent(e: { name: string; introMd: string; slug: string }, webUrl: string): string {
  return [`🎉 *${e.name}*`, '', firstParagraphPlain(e.introMd), '', `${webUrl}/eventos/${e.slug}`].join('\n')
}
