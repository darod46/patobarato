import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPageCopy } from '../../lib/page-copy'
import AboutPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

const copy = {
  kind: 'static' as const,
  slug: 'sobre-nosotros',
  title: 'Sobre PatoBarato: quiénes somos y cómo elegimos los chollos',
  h1: 'Sobre PatoBarato',
  introMd: 'PatoBarato caza chollos.\n\n## Cómo elegimos los chollos\n\nMiramos el histórico.\n\n## Cómo ganamos dinero\n\nCon afiliación.',
  faq: [],
  updatedAt: '2026-11-20T10:00:00Z',
}

beforeEach(() => {
  vi.mocked(fetchPageCopy).mockReset()
})

describe('AboutPage', () => {
  it('renders the h1 and both sections with anchor ids', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(copy)
    const { container } = render(await AboutPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Sobre PatoBarato' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo elegimos los chollos' })).toHaveAttribute('id', 'como-elegimos-los-chollos')
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo ganamos dinero' })).toHaveAttribute('id', 'como-ganamos-dinero')
    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('')
    expect(ld).toContain('AboutPage')
    expect(ld).toContain('Organization')
    expect(ld).toContain('BreadcrumbList')
  })

  it('renders the default h1 and an honest fallback when the copy row is missing', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(null)
    render(await AboutPage())
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('PatoBarato es un proyecto independiente de caza de chollos.')).toBeInTheDocument()
  })

  it('throws when the copy read fails', async () => {
    vi.mocked(fetchPageCopy).mockImplementation(async () => {
      throw new Error('db down')
    })
    await expect(AboutPage()).rejects.toThrow('db down')
  })

  it('also throws from generateMetadata when the copy read fails', async () => {
    vi.mocked(fetchPageCopy).mockImplementation(async () => {
      throw new Error('db down')
    })
    await expect(generateMetadata()).rejects.toThrow('db down')
  })

  it('is indexable with canonical /sobre-nosotros', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(copy)
    const meta = await generateMetadata()
    expect(meta.alternates?.canonical).toBe('/sobre-nosotros')
    expect(meta.robots).toBeUndefined()
  })
})

describe('AboutPage during the build', () => {
  afterEach(() => {
    delete process.env.NEXT_PHASE
  })

  it('renders the default h1 and the fallback paragraph, indexable, when the copy cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchPageCopy).mockRejectedValue(new TypeError('fetch failed'))
    expect((await generateMetadata()).robots).toBeUndefined()
    render(await AboutPage())
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('PatoBarato es un proyecto independiente de caza de chollos.')).toBeInTheDocument()
  })
})
