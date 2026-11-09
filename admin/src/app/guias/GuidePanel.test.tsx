import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideDetail } from '../../lib/guides'

const m = vi.hoisted(() => ({
  getGuide: vi.fn(),
  saveGuide: vi.fn(),
  saveGuideItems: vi.fn(),
  enqueueJob: vi.fn(),
  jobState: { status: null as string | null, error: null as string | null, result: null as unknown, stuck: false },
}))

vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/guides', () => ({ getGuide: m.getGuide, saveGuide: m.saveGuide, saveGuideItems: m.saveGuideItems }))
vi.mock('../../lib/jobs', () => ({ enqueueJob: m.enqueueJob, useJob: () => m.jobState }))
vi.mock('../../components/JobStatus', () => ({ JobStatus: ({ jobId }: { jobId: number | null }) => <p>job {jobId}</p> }))

import { GuidePanel } from './GuidePanel'

const existing: GuideDetail = {
  id: 4,
  slug: 'freidoras',
  title: 'Freidoras',
  subtitle: 'Las mejores',
  category: 'Hogar',
  introMd: 'Intro',
  howToChooseMd: '',
  faq: [],
  author: 'el Pato',
  readingMinutes: 5,
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 1, name: 'Ninja', award: '', summaryMd: '', pros: [], cons: [], specs: [], imageUrl: '', stores: [] }],
}

function setup(id: string, detail: Partial<GuideDetail> = {}) {
  m.getGuide.mockResolvedValue({ ...existing, ...detail })
  const onChanged = vi.fn()
  const onSaved = vi.fn()
  const view = render(<GuidePanel id={id} onChanged={onChanged} onSaved={onSaved} />)
  return { onChanged, onSaved, ...view }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.saveGuide.mockResolvedValue(4)
  m.saveGuideItems.mockResolvedValue(undefined)
  m.enqueueJob.mockResolvedValue(77)
  m.jobState = { status: null, error: null, result: null, stuck: false }
  process.env.NEXT_PUBLIC_WEB_URL = 'https://patobarato.es'
})

describe('GuidePanel', () => {
  it('new guide slug follows title until edited', async () => {
    setup('new')
    const title = await screen.findByLabelText('Título')
    const slug = screen.getByLabelText('Slug')
    await userEvent.type(title, 'Freidoras de aire')
    expect(slug).toHaveValue('freidoras-de-aire')
    await userEvent.type(slug, 'x')
    await userEvent.type(title, ' baratas')
    expect(slug).toHaveValue('freidoras-de-airex')
  })

  it('has the four tabs', async () => {
    setup('4')
    await screen.findByLabelText('Título')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Datos', 'Contenido', 'FAQ', 'Productos'])
    await userEvent.click(screen.getByRole('tab', { name: 'Productos' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ninja')
  })

  it('saves the guide and its items, then enqueues revalidate', async () => {
    const { onChanged } = setup('4')
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(m.saveGuide).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 4, slug: 'freidoras', publishedAt: '2026-01-01T00:00:00.000Z' })))
    expect(m.saveGuideItems).toHaveBeenCalledWith(expect.anything(), 4, [expect.objectContaining({ id: 1, name: 'Ninja' })])
    await waitFor(() => expect(m.enqueueJob).toHaveBeenCalledWith(expect.anything(), 'revalidate', {}))
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByText('job 77')).toBeInTheDocument()
  })

  it('duplicate slug shows Ese slug ya existe and does not revalidate', async () => {
    setup('new')
    m.saveGuide.mockRejectedValue(new Error('Ese slug ya existe'))
    await userEvent.type(await screen.findByLabelText('Título'), 'Freidoras')
    await userEvent.type(screen.getByLabelText('Categoría'), 'Hogar')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese slug ya existe')
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it('save ok but revalidate fails shows Guardado, pero no se pudo actualizar la web', async () => {
    setup('4')
    m.enqueueJob.mockRejectedValue(new Error('rls'))
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Guardado, pero no se pudo actualizar la web. Reinténtalo.')
    expect(screen.queryByText(/No se pudo guardar/)).toBeNull()
  })

  it('shows the web link only when published', async () => {
    const { unmount } = setup('4')
    expect(await screen.findByRole('link', { name: 'Ver en la web' })).toHaveAttribute('href', 'https://patobarato.es/guias/freidoras')
    unmount()
    setup('4', { status: 'draft' })
    await screen.findByLabelText('Título')
    expect(screen.queryByRole('link', { name: 'Ver en la web' })).toBeNull()
  })

  it('rejects an item without a name', async () => {
    setup('4', { items: [{ ...existing.items[0], name: ' ' }] })
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El producto 1 necesita un nombre')
    expect(m.saveGuide).not.toHaveBeenCalled()
  })
})
