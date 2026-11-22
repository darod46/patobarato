import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ listGuides: vi.fn() }))

vi.mock('../../lib/guides', () => ({ listGuides: m.listGuides }))
vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('./GuidePanel', () => ({ GuidePanel: () => null }))
vi.mock('../../components/ListPanelLayout', () => ({
  usePanelId: () => [null, vi.fn()],
  ListPanelLayout: ({ list }: { list: React.ReactNode }) => <div>{list}</div>,
}))

import Page from './page'

describe('Guías list', () => {
  it('labels draft, published and scheduled guides', async () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
    m.listGuides.mockResolvedValue([
      { id: 1, slug: 'a', title: 'Borradora', category: 'Hogar', status: 'draft', publishedAt: null },
      { id: 2, slug: 'b', title: 'Vieja', category: 'Hogar', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' },
      { id: 3, slug: 'c', title: 'Futura', category: 'Hogar', status: 'published', publishedAt: future },
    ])
    render(<Page />)
    await screen.findByText('Futura')
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByText(/^Programada · \d{1,2} [a-zñ]+$/)).toBeInTheDocument()
  })
})
