import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfferDetail } from '../../lib/offers'

const m = vi.hoisted(() => ({
  getOffer: vi.fn(),
  saveOffer: vi.fn(),
  setOfferStatus: vi.fn(),
  recentTelegramPublication: vi.fn(),
  enqueueJob: vi.fn(),
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/offers', () => ({
  getOffer: m.getOffer,
  saveOffer: m.saveOffer,
  setOfferStatus: m.setOfferStatus,
  recentTelegramPublication: m.recentTelegramPublication,
}))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))
vi.mock('../../components/JobStatus', () => ({ JobStatus: ({ jobId }: { jobId: number | null }) => <p>job {jobId}</p> }))

import { OfferPanel } from './OfferPanel'

const base: OfferDetail = {
  id: 5,
  offerId: 7,
  productId: 9,
  title: 'Ratón Logitech',
  store: 'amazon',
  imageUrl: 'https://img/x.jpg',
  price: 19.9,
  previousPrice: 30,
  coupon: null,
  priceBeforeCoupon: false,
  hashtags: ['tech'],
  affiliateUrl: 'https://amzn.to/abc',
  status: 'active',
  channel: 'telegram',
  messageId: 123,
  publishedAt: '2026-11-01T10:00:00Z',
  botPublishedAt: null,
}

function setup(detail: Partial<OfferDetail> = {}) {
  m.getOffer.mockResolvedValue({ ...base, ...detail })
  const onChanged = vi.fn()
  render(<OfferPanel id="5" onChanged={onChanged} />)
  return { onChanged }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.saveOffer.mockResolvedValue(undefined)
  m.setOfferStatus.mockResolvedValue(undefined)
  m.enqueueJob.mockResolvedValue(77)
  m.recentTelegramPublication.mockResolvedValue(null)
  m.jobState = { status: null, error: null, result: null, stuck: false }
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('OfferPanel', () => {
  it('shows the state line and the caption preview', async () => {
    setup()
    expect(await screen.findByText('Telegram ✔')).toBeInTheDocument()
    expect(screen.getByTestId('preview').textContent).toContain('Ratón Logitech')
    expect(screen.getByTestId('preview').textContent).toContain('19,90 €')
  })

  it('save enqueues sync_post for telegram posts and revalidate for web-only', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar y actualizar Telegram' }))
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'sync_post', { publication_id: 5 }))
    expect(m.saveOffer).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ title: 'Ratón Logitech', price: 19.9, previousPrice: 30, hashtags: ['tech'] }),
    )
    expect(await screen.findByText('job 77')).toBeInTheDocument()
  })

  it('web-only posts only offer Guardar and enqueue revalidate', async () => {
    vi.resetAllMocks()
    m.saveOffer.mockResolvedValue(undefined)
    m.enqueueJob.mockResolvedValue(78)
    setup({ channel: 'web', messageId: null })
    expect(await screen.findByText('Solo web')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar y actualizar Telegram' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'revalidate', {}))
  })

  it('preview updates as price changes', async () => {
    setup()
    const price = await screen.findByLabelText('Precio (€)')
    await userEvent.clear(price)
    await userEvent.type(price, '149,99')
    expect(screen.getByTestId('preview').textContent).toContain('149,99 €')
  })

  it('rejects a previous price that is not above the price', async () => {
    setup()
    const prev = await screen.findByLabelText('Precio anterior (€)')
    await userEvent.clear(prev)
    await userEvent.type(prev, '10')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y actualizar Telegram' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El precio anterior debe ser mayor que el precio')
    expect(m.saveOffer).not.toHaveBeenCalled()
  })

  it('terminar confirms, sets ended and enqueues sync_post', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Terminar oferta' }))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(m.setOfferStatus).toHaveBeenCalledWith(expect.anything(), 5, 'ended'))
    expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'sync_post', { publication_id: 5 })
  })

  it('terminar does nothing when not confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Terminar oferta' }))
    expect(m.setOfferStatus).not.toHaveBeenCalled()
  })

  it('reactivar sets active and enqueues sync_post', async () => {
    setup({ status: 'ended' })
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }))
    await waitFor(() => expect(m.setOfferStatus).toHaveBeenCalledWith(expect.anything(), 5, 'active'))
    expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'sync_post', { publication_id: 5 })
  })

  it('publish draft saves, warns when published 2 days ago, then enqueues publish_draft', async () => {
    setup({ status: 'draft', messageId: null })
    m.recentTelegramPublication.mockResolvedValue(new Date(Date.now() - 2 * 86_400_000).toISOString())
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar en Telegram' }))
    await waitFor(() =>
      expect(window.confirm).toHaveBeenCalledWith('Ya se publicó hace 2 días. ¿Publicar de todas formas?'),
    )
    expect(m.saveOffer).toHaveBeenCalled()
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'publish_draft', { publication_id: 5 }))
  })

  it('publish draft does not enqueue when the warning is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    setup({ status: 'draft', messageId: null })
    m.recentTelegramPublication.mockResolvedValue(new Date(Date.now() - 2 * 86_400_000).toISOString())
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar en Telegram' }))
    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it('shows the duplicate banner for drafts the bot already published', async () => {
    setup({ status: 'draft', messageId: null, botPublishedAt: '2026-11-02T10:00:00Z' })
    expect(await screen.findByText(/El bot ya la publicó 02\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  it('refreshes the panel and list when the job is done', async () => {
    const { onChanged } = setup({ status: 'draft', messageId: null })
    const button = await screen.findByRole('button', { name: 'Publicar en Telegram' })
    m.getOffer.mockResolvedValue({ ...base, status: 'active' })
    m.jobState = { status: 'done', error: null, result: {}, stuck: false }
    await userEvent.click(button)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await screen.findByText('Telegram ✔')).toBeInTheDocument()
  })

  it('offers WhatsApp actions with the offer text', async () => {
    setup()
    const box = (await screen.findByLabelText('Texto para WhatsApp')) as HTMLTextAreaElement
    expect(box.value).toContain('Ratón Logitech')
  })
})
