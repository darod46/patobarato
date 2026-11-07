import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DealsPage, { generateMetadata, revalidate } from './page'

describe('/chollos', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('is static ISR', () => {
    expect(revalidate).toBe(60)
  })

  it('has the fixed title and a canonical on /chollos, also without data', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('Chollos de hoy · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/chollos')
    expect(meta.robots).toBeUndefined()
  })

  it('renders the listing page and the breadcrumb even when the server fetch fails', async () => {
    const { container } = render(await DealsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Inicio', 'Chollos'])
    expect(ld.itemListElement[1].item).toMatch(/\/chollos$/)
  })
})
