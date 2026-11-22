/** Fixed-window limiter counting every request per key; request `max + 1` of a key in the window is refused. */
export class RequestLimiter {
  private counts = new Map<string, number>()
  private windowStart: number
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(max = 20, windowMs = 60_000, now: () => number = Date.now) {
    this.max = max
    this.windowMs = windowMs
    this.now = now
    this.windowStart = now()
  }

  allow(key: string): boolean {
    const t = this.now()
    if (t - this.windowStart >= this.windowMs) {
      this.counts.clear()
      this.windowStart = t
    }
    const n = (this.counts.get(key) ?? 0) + 1
    if (n > this.max) return false
    this.counts.set(key, n)
    return true
  }
}

/** Fixed-window limiter counting DISTINCT keys; repeats of a seen key are free. */
export class RateLimiter {
  private keys = new Set<string>()
  private windowStart: number
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(max = 30, windowMs = 60_000, now: () => number = Date.now) {
    this.max = max
    this.windowMs = windowMs
    this.now = now
    this.windowStart = now()
  }

  allow(key: string): boolean {
    const t = this.now()
    if (t - this.windowStart >= this.windowMs) {
      this.keys.clear()
      this.windowStart = t
    }
    if (this.keys.has(key)) return true
    if (this.keys.size >= this.max) return false
    this.keys.add(key)
    return true
  }
}
