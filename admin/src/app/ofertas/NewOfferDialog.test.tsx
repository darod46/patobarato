import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))

import { NewOfferDialog } from './NewOfferDialog'

beforeEach(() => {
  vi.resetAllMocks()
  m.enqueueJob.mockResolvedValue(11)
  m.jobState = { status: null, error: null, result: null, stuck: false }
})

async function submit(url = 'https://www.amazon.es/dp/B0TEST') {
  await userEvent.type(screen.getByLabelText('Enlace del producto'), url)
  await userEvent.click(screen.getByRole('button', { name: 'Crear borrador' }))
}

describe('NewOfferDialog', () => {
  it('enqueues create_offer_from_url with the pasted link', async () => {
    render(<NewOfferDialog onCreated={() => {}} onClose={() => {}} />)
    await submit()
    await waitFor(() =>
      expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'create_offer_from_url', {
        url: 'https://www.amazon.es/dp/B0TEST',
      }),
    )
  })

  it('new offer dialog opens the draft on job done', async () => {
    const onCreated = vi.fn()
    render(<NewOfferDialog onCreated={onCreated} onClose={() => {}} />)
    m.jobState = { status: 'done', error: null, result: { publication_id: 42 }, stuck: false }
    await submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('42'))
  })

  it('new offer dialog shows job error text', async () => {
    render(<NewOfferDialog onCreated={() => {}} onClose={() => {}} />)
    m.jobState = { status: 'error', error: 'No se pudo leer el producto', result: null, stuck: false }
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el producto')
  })
})
