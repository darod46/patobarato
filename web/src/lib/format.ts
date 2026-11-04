/** Formats a price as es-ES: "1.299,90 €" (non-breaking space before the euro sign). */
export function formatPrice(value: number): string {
  const [int, dec] = Math.abs(value).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${value < 0 ? '-' : ''}${grouped},${dec} €`
}

/** Round-half-up discount percentage (same rule as the bot); null when there is no discount. */
export function discountPercent(price: number, previous: number): number | null {
  if (previous <= price) return null
  const prevCents = Math.round(previous * 100)
  const priceCents = Math.round(price * 100)
  if (prevCents <= priceCents) return null
  return Math.floor(((prevCents - priceCents) * 100) / prevCents + 0.5)
}

export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

/** Escapes LIKE/ILIKE wildcards so user text is matched literally. */
export function escapeIlike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}
