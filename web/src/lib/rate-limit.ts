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
