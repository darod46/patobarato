import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { revalidatePath } from 'next/cache'

const mockRevalidate = vi.mocked(revalidatePath)

async function load() {
  vi.resetModules()
  return (await import('./route')).POST
}
const call = (POST: (r: Request) => Promise<Response>, secret?: string) =>
  POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: secret === undefined ? {} : { 'x-revalidate-secret': secret },
    }),
  )

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 'right-secret'
    mockRevalidate.mockReset()
  })
  afterEach(() => {
    delete process.env.REVALIDATE_SECRET
  })

  it('rejects missing secret (401)', async () => {
    const res = await call(await load())
    expect(res.status).toBe(401)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('rejects wrong secret (401)', async () => {
    const POST = await load()
    expect((await call(POST, 'wrong-secret!')).status).toBe(401)
    expect((await call(POST, 'x')).status).toBe(401)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('rejects when REVALIDATE_SECRET unset (401)', async () => {
    delete process.env.REVALIDATE_SECRET
    const POST = await load()
    expect((await call(POST, '')).status).toBe(401)
    expect((await call(POST, 'anything')).status).toBe(401)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('revalidates the whole layout with the right secret', async () => {
    const res = await call(await load(), 'right-secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revalidated: true })
    expect(mockRevalidate).toHaveBeenCalledWith('/', 'layout')
  })
})
