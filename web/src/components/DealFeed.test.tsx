import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { DealFeed } from './DealFeed'

const now = new Date('2026-11-04T12:00:00Z')
const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  affiliateUrl: 'https://amzn.to/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `A${id}`,
  country: 'es',
  store: 'amazon',
  productId: 1,
})

function setup(over: Partial<ComponentProps<typeof DealFeed>> = {}) {
  const props = {
    q: '',
    tag: null,
    onTag: vi.fn(),
    onClear: vi.fn(),
    fetchDeals: vi.fn().mockResolvedValue({ deals: [deal(1), deal(2)], hasMore: false }),
    fetchHashtags: vi.fn().mockResolvedValue([{ tag: 'sony', count: 3 }]),
    now,
    ...over,
  }
  render(<DealFeed {...props} />)
  return props
}

describe('DealFeed', () => {
  it('shows skeletons while loading, then cards and chips', async () => {
    setup()
    expect(screen.getByTestId('feed-skeletons')).toBeInTheDocument()
    expect(await screen.findByText('Chollo 1')).toBeInTheDocument()
    expect(screen.queryByTestId('feed-skeletons')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '#sony' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('loads more when hasMore', async () => {
    const fetchDeals = vi
      .fn()
      .mockResolvedValueOnce({ deals: [deal(1)], hasMore: true })
      .mockResolvedValueOnce({ deals: [deal(2)], hasMore: false })
    setup({ fetchDeals })
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText('Chollo 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('shows EmptyState and clears', async () => {
    const props = setup({ fetchDeals: vi.fn().mockResolvedValue({ deals: [], hasMore: false }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }))
    expect(props.onClear).toHaveBeenCalled()
  })

  it('shows ErrorState and Reintentar refetches', async () => {
    const fetchDeals = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ deals: [deal(1)], hasMore: false })
    setup({ fetchDeals })
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Chollo 1')).toBeInTheDocument()
    expect(fetchDeals).toHaveBeenCalledTimes(2)
  })

  it('shows the active tag chip even when no chips were loaded', async () => {
    setup({ tag: 'lego', fetchHashtags: vi.fn().mockResolvedValue([]) })
    await screen.findByText('Chollo 1')
    expect(screen.getByRole('button', { name: '#lego' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
  })

  it('renders no chips and no error when hashtags fail', async () => {
    setup({ fetchHashtags: vi.fn().mockRejectedValue(new Error('x')) })
    await screen.findByText('Chollo 1')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
  })
})
