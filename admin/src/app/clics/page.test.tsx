import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listClicks = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('../../lib/clicks', async (orig) => ({ ...(await orig<typeof import('../../lib/clicks')>()), listClicks }))

import ClicsPage from './page'

describe('ClicsPage', () => {
  beforeEach(() => { listClicks.mockReset() })

  it('shows loading then the table with totals', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
    listClicks.mockResolvedValue([
      { day: today, placement: 'hero', clicks: 3 },
      { day: today, placement: 'footer', clicks: 2 },
    ])
    render(<ClicsPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    const table = await screen.findByRole('table', { name: /clics/i })
    expect(within(table).getByRole('columnheader', { name: 'Ficha de chollo' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + 14 + 1)
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent(today)
    expect(within(rows[1]).getAllByRole('cell').at(-1)).toHaveTextContent('5')
    const totals = within(rows.at(-1)!)
    expect(totals.getByRole('rowheader')).toHaveTextContent('Total')
    expect(totals.getAllByRole('cell').at(-1)).toHaveTextContent('5')
  })

  it('shows an empty message when there are no clicks', async () => {
    listClicks.mockResolvedValue([])
    render(<ClicsPage />)
    expect(await screen.findByText('Sin clics todavía')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows errors', async () => {
    listClicks.mockImplementation(() => Promise.reject(new Error('boom')))
    render(<ClicsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})
