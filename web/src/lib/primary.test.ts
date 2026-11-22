import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { primary } from './primary'

describe('primary', () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.NEXT_PHASE
    vi.restoreAllMocks()
  })

  it('resolves the loaded value', async () => {
    await expect(primary('x', async () => 42)).resolves.toBe(42)
  })

  it('rethrows at runtime, also a synchronous throw', async () => {
    await expect(primary('x', () => Promise.reject(new Error('down')))).rejects.toThrow('down')
    await expect(
      primary('x', () => {
        throw new Error('no env')
      }),
    ).rejects.toThrow('no env')
    expect(log).not.toHaveBeenCalled()
  })

  it('resolves undefined and logs the error name and message during the build', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    await expect(primary('cupones', () => Promise.reject(new TypeError('fetch failed')))).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('cupones: server data unavailable at build —', 'TypeError: fetch failed')
  })
})
