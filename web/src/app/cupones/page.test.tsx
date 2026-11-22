import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCoupons } from '../../lib/coupons'
import { fetchPageCopy } from '../../lib/page-copy'
import type { Coupon, PageCopy } from '../../lib/types'
import CouponsPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/coupons', () => ({ fetchCoupons: vi.fn() }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

const coupon = (id: number, store: string, code: string): Coupon => ({
  id,
  store,
  code,
  title: '−6 € en 40 €',
  conditions: null,
  url: null,
  startsAt: '2026-11-01T00:00:00Z',
  expiresAt: null,
  discountAmount: null,
  discountPct: null,
  minPurchase: null,
  eventId: null,
})

const copy: PageCopy = {
  kind: 'static',
  slug: 'cupones',
  title: 'Cupones de descuento vigentes y comprobados',
  h1: 'Cupones de descuento',
  introMd: 'Antes de publicar un cupón comprobamos que funciona.',
  faq: [{ q: '¿Los cupones están comprobados?', aMd: 'Sí.' }],
  updatedAt: '2026-11-20T10:00:00Z',
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(fetchCoupons).mockReset()
  vi.mocked(fetchPageCopy).mockReset().mockResolvedValue(null)
})

describe('CouponsPage', () => {
  it('groups the coupons by store under the default h1 without copy', async () => {
    vi.mocked(fetchCoupons).mockResolvedValue([coupon(1, 'aliexpress', 'PATO6'), coupon(2, 'amazon', 'PATO10')])
    render(await CouponsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Cupones de descuento vigentes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'AliExpress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Amazon España' })).toBeInTheDocument()
    expect(screen.getByText('PATO6')).toBeInTheDocument()
  })

  it('is indexable with no coupons and keeps the copy and the honest empty state', async () => {
    vi.mocked(fetchCoupons).mockResolvedValue([])
    vi.mocked(fetchPageCopy).mockResolvedValue(copy)
    const meta = await generateMetadata()
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Cupones de descuento vigentes y comprobados · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/cupones')
    render(await CouponsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Cupones de descuento' })).toBeInTheDocument()
    expect(screen.getByText('Antes de publicar un cupón comprobamos que funciona.')).toBeInTheDocument()
    expect(screen.getByText('¿Los cupones están comprobados?')).toBeInTheDocument()
    expect(screen.getByText('Ahora mismo no hay cupones vigentes. Los publicamos en el canal en cuanto salen.')).toBeInTheDocument()
  })

  it('rejects (never an empty page) when the coupons read fails', async () => {
    vi.mocked(fetchCoupons).mockImplementation(async () => {
      throw new Error('down')
    })
    await expect(CouponsPage()).rejects.toThrow('down')
  })
})

describe('CouponsPage during the build', () => {
  afterEach(() => {
    delete process.env.NEXT_PHASE
  })

  it('renders the honest empty state when the coupons cannot be read', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchCoupons).mockRejectedValue(new TypeError('fetch failed'))
    render(await CouponsPage())
    expect(screen.getByText(/Ahora mismo no hay cupones vigentes/)).toBeInTheDocument()
  })
})
