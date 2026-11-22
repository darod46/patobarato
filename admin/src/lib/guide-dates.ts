import type { GuideStatus } from './guides'

const ZONE = 'Europe/Madrid'

const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: ZONE })
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Wall-clock fields of an instant in Madrid, as a UTC-based timestamp (so differences are plain arithmetic). */
function madridWallAsUtc(ms: number): number {
  const p: Record<string, number> = {}
  for (const { type, value } of PARTS.formatToParts(new Date(ms))) if (type !== 'literal') p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** «Borrador» | «Publicada» | «Programada · 30 nov» (published with a future `published_at`). */
export function guideStatusLabel(status: GuideStatus, publishedAt: string | null, now: Date): string {
  if (status !== 'published') return 'Borrador'
  if (publishedAt && new Date(publishedAt).getTime() > now.getTime()) {
    const parts = DAY_MONTH.formatToParts(new Date(publishedAt))
    const day = parts.find((p) => p.type === 'day')?.value ?? ''
    const month = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/\.$/, '')
    return `Programada · ${day} ${month}`
  }
  return 'Publicada'
}

/** ISO instant -> 'YYYY-MM-DDTHH:mm' in Madrid (value of a datetime-local input); '' for null. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const d = new Date(madridWallAsUtc(ms))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 'YYYY-MM-DDTHH:mm' read as Madrid wall time -> ISO UTC instant (DST-aware); '' or invalid -> null. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  // Madrid offset at (roughly) that instant, then once more at the corrected instant to settle across a DST change.
  let guess = wall - (madridWallAsUtc(wall) - wall)
  guess = wall - (madridWallAsUtc(guess) - guess)
  return new Date(guess).toISOString()
}
