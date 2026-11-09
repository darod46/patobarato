/** Rounds half up, ignoring binary float noise (1.005 * 100 = 100.49999999999999). */
function roundHalfUp(x: number): number {
  return Math.round(Number(x.toPrecision(12)))
}

/** Spanish format, same as the bot's Python `format_price`: 1299.9 -> "1.299,90". */
export function formatPrice(n: number): string {
  const cents = roundHalfUp(n * 100)
  const whole = Math.floor(cents / 100)
  const frac = String(cents % 100).padStart(2, '0')
  return `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`
}

/** Percent off `previous`, rounded half up (same as the bot's `discount_percent`). */
export function discountPercent(price: number, previous: number): number {
  return roundHalfUp(((previous - price) / previous) * 100)
}
