import { describe, expect, it, vi } from 'vitest'
import { optional } from './optional'

describe('optional', () => {
  it('resolves the loader value', async () => {
    expect(await optional('x', async () => 42)).toBe(42)
  })

  it('returns undefined and logs the reason on a rejected loader', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await optional('home', async () => { throw new Error('boom') })).toBeUndefined()
    expect(error).toHaveBeenCalledWith('home: server data unavailable —', 'boom')
    error.mockRestore()
  })

  it('catches a synchronous throw inside the loader', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await optional('x', () => { throw new Error('missing env') })).toBeUndefined()
    vi.restoreAllMocks()
  })
})
