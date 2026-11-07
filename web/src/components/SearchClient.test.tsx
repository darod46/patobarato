import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { product } from './search/fixtures'
import { SearchClient } from './SearchClient'

const NOW = '2026-11-04T12:00:00Z'
const fetchDeals = () => vi.fn().mockResolvedValue({ deals: [], hasMore: false })

beforeEach(() => history.replaceState(null, '', '/buscar'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('without a query shows the shortcuts and no blocks', () => {
  render(<SearchClient now={NOW} tags={['sony']} stores={[{ store: 'amazon', deals: 1, coupons: 0 }]} fetchDeals={fetchDeals()} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Buscar' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '#sony' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Chollos' })).toBeNull()
})

it('with one character asks for two letters and keeps the plain H1', () => {
  render(<SearchClient now={NOW} initialQ="x" fetchDeals={fetchDeals()} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Buscar' })).toBeInTheDocument()
  expect(screen.getByText('Escribe al menos dos letras')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Chollos' })).toBeNull()
})

it('with a query renders the three blocks; empty stores stay hidden', async () => {
  const fetchAli = vi.fn().mockResolvedValue([product({ origin: 'aliexpress', store: 'aliexpress', title: 'Freidora Ali' })])
  const fetchCatalog = vi.fn().mockResolvedValue([])
  render(<SearchClient now={NOW} initialQ="freidora" fetchDeals={fetchDeals()} fetchAli={fetchAli} fetchCatalog={fetchCatalog} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Resultados para “freidora”' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Chollos' })).toBeInTheDocument()
  expect(await screen.findByText('Freidora Ali')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'En AliExpress' })).toBeInTheDocument()
  expect(screen.getByText(/Precio en AliExpress ahora mismo/)).toBeInTheDocument()
  await waitFor(() => expect(fetchCatalog).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'En tiendas' })).toBeNull())
})

it('hides the AliExpress block when the endpoint answers 204', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<SearchClient now={NOW} initialQ="freidora" fetchDeals={fetchDeals()} fetchCatalog={vi.fn().mockResolvedValue([product()])} />)
  expect(await screen.findByText('Ratón inalámbrico')).toBeInTheDocument()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/buscar/aliexpress?q=freidora', expect.anything()))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'En AliExpress' })).toBeNull())
})

it('ignores a stale response from a previous query', async () => {
  let resolveOld!: (p: ReturnType<typeof product>[]) => void
  const fetchCatalog = vi
    .fn()
    .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    .mockResolvedValue([product({ title: 'Nuevo resultado' })])
  render(<SearchClient now={NOW} initialQ="ab" fetchDeals={fetchDeals()} fetchAli={vi.fn().mockResolvedValue([])} fetchCatalog={fetchCatalog} />)
  await waitFor(() => expect(fetchCatalog).toHaveBeenCalledTimes(1))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'c')
  expect(await screen.findByText('Nuevo resultado')).toBeInTheDocument()
  await act(async () => resolveOld([product({ title: 'Resultado viejo' })]))
  expect(screen.queryByText('Resultado viejo')).toBeNull()
})

it('typing updates the URL with replaceState after 300 ms', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const spy = vi.spyOn(history, 'replaceState')
  render(<SearchClient now={NOW} fetchDeals={fetchDeals()} fetchAli={vi.fn().mockResolvedValue([])} fetchCatalog={vi.fn().mockResolvedValue([])} />)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'lego')
  expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('lego')
  expect(spy).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTime(300))
  expect(spy).toHaveBeenLastCalledWith(null, '', '/buscar?q=lego')
  await user.clear(screen.getByRole('searchbox', { name: 'Buscar' }))
  await act(async () => vi.advanceTimersByTime(300))
  expect(spy).toHaveBeenLastCalledWith(null, '', '/buscar')
  spy.mockRestore()
})

it('Enter writes the URL at once', async () => {
  const spy = vi.spyOn(history, 'replaceState')
  render(<SearchClient now={NOW} fetchDeals={fetchDeals()} fetchAli={vi.fn().mockResolvedValue([])} fetchCatalog={vi.fn().mockResolvedValue([])} />)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'lego{Enter}')
  expect(spy).toHaveBeenCalledWith(null, '', '/buscar?q=lego')
  spy.mockRestore()
})

it('reads ?q= from the URL on mount', async () => {
  history.replaceState(null, '', '/buscar?q=lego')
  render(<SearchClient now={NOW} fetchDeals={fetchDeals()} fetchAli={vi.fn().mockResolvedValue([])} fetchCatalog={vi.fn().mockResolvedValue([])} />)
  await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('lego'))
})

it('hides the header search link (the page is the search) and has no hashtag chips with a query', async () => {
  history.replaceState(null, '', '/buscar?q=lego')
  render(
    <SearchClient
      now={NOW}
      initialQ="lego"
      tags={['sony']}
      fetchDeals={fetchDeals()}
      fetchAli={vi.fn().mockResolvedValue([])}
      fetchCatalog={vi.fn().mockResolvedValue([])}
    />,
  )
  expect(screen.queryByRole('link', { name: 'Buscar' })).toBeNull()
  await screen.findByRole('button', { name: 'Quitar filtros' })
  expect(screen.queryByRole('link', { name: '#sony' })).toBeNull()
  expect(screen.queryByRole('button', { name: '#sony' })).toBeNull()
})

it('the empty deals state clears the field and the URL', async () => {
  history.replaceState(null, '', '/buscar?q=lego')
  render(<SearchClient now={NOW} initialQ="lego" fetchDeals={fetchDeals()} fetchAli={vi.fn().mockResolvedValue([])} fetchCatalog={vi.fn().mockResolvedValue([])} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }))
  await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue(''))
  await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/buscar'))
})
