import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventDetail } from '../../lib/events'

const m = vi.hoisted(() => ({
  getEvent: vi.fn(),
  saveEvent: vi.fn(),
  enqueueJob: vi.fn(),
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/events', () => ({ getEvent: m.getEvent, saveEvent: m.saveEvent }))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))
vi.mock('../../components/JobStatus', () => ({ JobStatus: ({ jobId }: { jobId: number | null }) => <p>job {jobId}</p> }))

import { EventPanel } from './EventPanel'

const existing: EventDetail = {
  id: 4,
  slug: 'black-friday',
  name: 'Black Friday',
  stores: ['amazon'],
  startsOn: '2026-11-20',
  endsOn: '2026-11-30',
  approximate: false,
  hashtags: ['BlackFriday'],
  aliexpressPromo: null,
  introMd: 'Intro',
  tipsMd: '',
  faq: [],
  status: 'published',
  promoCount: 12,
  lastSyncedAt: '2026-11-08T10:00:00.000Z',
}

function setup(id: string, detail: Partial<EventDetail> = {}) {
  m.getEvent.mockResolvedValue({ ...existing, ...detail })
  const onChanged = vi.fn()
  const onSaved = vi.fn()
  const view = render(<EventPanel id={id} onChanged={onChanged} onSaved={onSaved} />)
  return { onChanged, onSaved, ...view }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.saveEvent.mockResolvedValue(9)
  m.enqueueJob.mockResolvedValue(77)
  m.jobState = { status: null, error: null, result: null, stuck: false }
  process.env.NEXT_PUBLIC_WEB_URL = 'https://patobarato.es'
})

describe('EventPanel', () => {
  it('new event slug follows name until edited', async () => {
    setup('new')
    const name = await screen.findByLabelText('Nombre')
    const slug = screen.getByLabelText('Slug')
    await userEvent.type(name, 'Día del Soltero')
    expect(slug).toHaveValue('dia-del-soltero')
    await userEvent.type(slug, 'x')
    await userEvent.type(name, ' 11.11')
    expect(slug).toHaveValue('dia-del-solterox')
  })

  it('duplicate slug shows Ese slug ya existe', async () => {
    setup('new')
    m.saveEvent.mockRejectedValue(new Error('Ese slug ya existe'))
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Black Friday')
    await userEvent.type(screen.getByLabelText('Empieza'), '2026-11-20')
    await userEvent.type(screen.getByLabelText('Termina'), '2026-11-30')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese slug ya existe')
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it('saving enqueues revalidate and keeps the job after switching to the new id', async () => {
    const { onSaved, rerender, onChanged } = setup('new')
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Black Friday')
    await userEvent.type(screen.getByLabelText('Empieza'), '2026-11-20')
    await userEvent.type(screen.getByLabelText('Termina'), '2026-11-30')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() =>
      expect(m.saveEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-20', endsOn: '2026-11-30', status: 'published' }),
      ),
    )
    expect(m.saveEvent.mock.calls[0][1]).not.toHaveProperty('id')
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'revalidate', {}))
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(onChanged).toHaveBeenCalled()
    rerender(<EventPanel id="9" onChanged={onChanged} onSaved={onSaved} />)
    expect(await screen.findByText('job 77')).toBeInTheDocument()
  })

  it('save ok but revalidate fails shows Guardado, pero no se pudo actualizar la web', async () => {
    setup('4')
    m.saveEvent.mockResolvedValue(4)
    m.enqueueJob.mockRejectedValue(new Error('rls'))
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Guardado, pero no se pudo actualizar la web. Reinténtalo.')
    expect(screen.queryByText(/No se pudo guardar/)).toBeNull()
  })

  it('rejects end before start', async () => {
    setup('4', { startsOn: '2026-11-20', endsOn: '2026-11-10' })
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de fin debe ser igual o posterior al inicio')
    expect(m.saveEvent).not.toHaveBeenCalled()
  })

  it('shows promo count and web link only when published', async () => {
    const { unmount } = setup('4')
    expect(await screen.findByText(/12 ofertas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en la web' })).toHaveAttribute('href', 'https://patobarato.es/eventos/black-friday')
    unmount()
    setup('4', { status: 'draft' })
    await screen.findByLabelText('Nombre')
    expect(screen.queryByRole('link', { name: 'Ver en la web' })).toBeNull()
  })
})
