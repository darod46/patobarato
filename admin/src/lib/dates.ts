const TZ = 'Europe/Madrid'

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function madridFields(ms: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of parts.formatToParts(new Date(ms))) out[p.type] = p.value
  return out
}

/** `datetime-local` value (Madrid wall time) of an ISO instant; '' when empty. */
export function isoToMadridLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const f = madridFields(ms)
  return `${f.year}-${f.month}-${f.day}T${f.hour}:${f.minute}`
}

/** ISO instant of a `datetime-local` value read as Madrid wall time; null when empty or invalid. */
export function madridLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Find the instant whose Madrid wall time equals the input (two passes cover DST changes).
  let ms = asUtc
  for (let i = 0; i < 2; i++) {
    const f = madridFields(ms)
    const shown = Date.UTC(Number(f.year), Number(f.month) - 1, Number(f.day), Number(f.hour), Number(f.minute))
    ms += asUtc - shown
  }
  return new Date(ms).toISOString()
}
