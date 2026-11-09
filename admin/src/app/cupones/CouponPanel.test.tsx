import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CouponDetail } from '../../lib/coupons'

const m = vi.hoisted(() => ({
  getCoupon: vi.fn(),
  saveCoupon: vi.fn(),
  listEvents: vi.fn(),
  enqueueJob: vi.fn(),
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/coupons', () => ({ getCoupon: m.getCoupon, saveCoupon: m.saveCoupon, listEvents: m.listEvents }))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))
vi.mock('../../components/JobStatus', () => ({ JobStatus: ({ jobId }: { jobId: number | null }) => <p>job {jobId}</p> }))

import { CouponPanel } from './CouponPanel'

const existing: CouponDetail = {
  id: 5,
  store: 'amazon',
  code: 'AHORRA10',
  title: '10% extra',
  conditions: null,
  url: 'https://amzn.to/x',
  startsAt: '2026-11-01T09:00:00.000Z',
  expiresAt: null,
  active: true,
  discountAmount: null,
  discountPct: 10,
  minPurchase: 50,
  eventId: null,
  sourceId: null,
}

function setup(id: string, detail: Partial<CouponDetail> = {}) {
  m.getCoupon.mockResolvedValue({ ...existing, ...detail })
  const onChanged = vi.fn()
  const onSaved = vi.fn()
  render(<CouponPanel id={id} onChanged={onChanged} onSaved={onSaved} />)
  return { onChanged, onSaved }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.saveCoupon.mockResolvedValue(9)
  m.enqueueJob.mockResolvedValue(77)
  m.listEvents.mockResolvedValue([{ id: 3, name: 'Black Friday' }])
  m.jobState = { status: null, error: null, result: null, stuck: false }
})

describe('CouponPanel', () => {
  it('new coupon saves and enqueues revalidate', async () => {
    const { onChanged, onSaved } = setup('new')
    await userEvent.type(await screen.findByLabelText('Tienda'), 'amazon')
    await userEvent.type(screen.getByLabelText('Código'), 'NUEVO5')
    await userEvent.type(screen.getByLabelText('Título'), '5 € de descuento')
    await userEvent.type(screen.getByLabelText('Descuento (€)'), '5,50')
    await userEvent.selectOptions(screen.getByLabelText('Evento'), '3')
    fireEvent.change(screen.getByLabelText('Caduca'), { target: { value: '2026-07-15T10:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(m.saveCoupon).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          store: 'amazon',
          code: 'NUEVO5',
          title: '5 € de descuento',
          discountAmount: 5.5,
          eventId: 3,
          expiresAt: '2026-07-15T08:30:00.000Z',
          active: true,
        }),
      ),
    )
    expect(m.saveCoupon.mock.calls[0][1]).not.toHaveProperty('id')
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'revalidate', {}))
    expect(m.getCoupon).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(onChanged).toHaveBeenCalled()
  })

  it('bot coupon shows overwrite warning', async () => {
    setup('5', { sourceId: 2 })
    expect(
      await screen.findByText('Este cupón lo sincroniza el bot: la próxima sincronización puede sobrescribir tus cambios.'),
    ).toBeInTheDocument()
  })

  it('manual coupon shows no warning', async () => {
    setup('5')
    await screen.findByLabelText('Código')
    expect(screen.queryByText(/lo sincroniza el bot/)).not.toBeInTheDocument()
  })

  it('rejects expiry before start', async () => {
    setup('5')
    await screen.findByLabelText('Código')
    fireEvent.change(screen.getByLabelText('Empieza'), { target: { value: '2026-12-10T10:00' } })
    fireEvent.change(screen.getByLabelText('Caduca'), { target: { value: '2026-12-01T10:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de caducidad debe ser posterior al inicio')
    expect(m.saveCoupon).not.toHaveBeenCalled()
  })

  it('requires store, code and title', async () => {
    setup('new')
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('obligatorios')
    expect(m.saveCoupon).not.toHaveBeenCalled()
  })

  it('shows an error when the save fails', async () => {
    m.saveCoupon.mockRejectedValue(new Error('boom'))
    setup('5')
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it('disables save while a job is running', async () => {
    m.jobState = { status: 'running', error: null, result: null, stuck: false }
    setup('5')
    const save = await screen.findByRole('button', { name: 'Guardar' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled())
  })

  it('updates an existing coupon with its id', async () => {
    setup('5')
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(m.saveCoupon).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 5, code: 'AHORRA10', discountPct: 10, minPurchase: 50 }),
      ),
    )
  })

  it('ignores a stale load when the id changes quickly', async () => {
    let resolveFirst: (d: CouponDetail) => void = () => {}
    m.getCoupon
      .mockImplementationOnce(() => new Promise<CouponDetail>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ ...existing, id: 6, code: 'SEGUNDO' })
    const { rerender } = render(<CouponPanel id="5" onChanged={vi.fn()} onSaved={vi.fn()} />)
    rerender(<CouponPanel id="6" onChanged={vi.fn()} onSaved={vi.fn()} />)
    expect(await screen.findByDisplayValue('SEGUNDO')).toBeInTheDocument()
    resolveFirst({ ...existing, code: 'PRIMERO' })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByDisplayValue('PRIMERO')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('SEGUNDO')).toBeInTheDocument()
  })
})
