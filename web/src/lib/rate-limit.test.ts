import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  it('allows up to max distinct keys per window', () => {
    const rl = new RateLimiter(3, 1000, () => 0)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(true)
    expect(rl.allow('c')).toBe(true)
    expect(rl.allow('d')).toBe(false)
  })

  it('does not consume a slot for a repeated key', () => {
    const rl = new RateLimiter(2, 1000, () => 0)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(true)
    expect(rl.allow('c')).toBe(false)
  })

  it('still allows already seen keys when full', () => {
    const rl = new RateLimiter(1, 1000, () => 0)
    rl.allow('a')
    expect(rl.allow('b')).toBe(false)
    expect(rl.allow('a')).toBe(true)
  })

  it('resets after the window elapses', () => {
    let t = 0
    const rl = new RateLimiter(1, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(false)
    t = 1000
    expect(rl.allow('b')).toBe(true)
  })
})
