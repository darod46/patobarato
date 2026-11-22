import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackCtaClick = vi.fn()
vi.mock('../lib/cta', () => ({ trackCtaClick: (p: string) => trackCtaClick(p) }))

import { formatMembers, messageUrl, type ChannelLive, type ChannelPost } from '../lib/telegram'
import { TelegramBlock } from './TelegramBlock'

const now = new Date('2026-11-22T12:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

const posts: ChannelPost[] = [
  { productId: 1, title: 'Auriculares Sony WH-1000XM5', price: 249.99, messageId: 101, publishedAt: minutesAgo(12) },
  { productId: 2, title: 'Freidora de aire Cosori', price: 79, messageId: 100, publishedAt: minutesAgo(90) },
  { productId: 3, title: 'Lego Technic', price: 1299.9, messageId: 99, publishedAt: minutesAgo(60 * 26) },
]

const live = (stats: Partial<ChannelLive['stats']> = {}, list: ChannelPost[] = posts): ChannelLive => ({
  stats: { members: 1240, checkedAt: minutesAgo(30), postedToday: 7, lastPostedAt: minutesAgo(12), ...stats },
  posts: list,
})

const noDeal = () => Promise.resolve(null)

describe('TelegramBlock', () => {
  beforeEach(() => trackCtaClick.mockClear())

  it('shows the live channel figures above the button', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} live={live()} now={now} />)
    const row = screen.getByRole('list', { name: 'Actividad del canal' })
    expect(within(row).getByText('7 chollos hoy')).toBeInTheDocument()
    expect(within(row).getByText('Último chollo hace 12 min')).toBeInTheDocument()
    expect(within(row).getByText(`${formatMembers(1240)} suscriptores`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Unirme al canal gratis' })).toBeInTheDocument()
  })

  it('lists the latest channel posts linking to their messages', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} live={live()} now={now} />)
    const list = screen.getByRole('list', { name: 'Últimos en el canal' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([messageUrl(101), messageUrl(100), messageUrl(99)])
    expect(links[0]).toHaveTextContent('Auriculares Sony WH-1000XM5')
    expect(links[0]).toHaveTextContent('249,99 €')
    expect(links[0]).toHaveTextContent('hace 12 min')
    expect(links[1]).toHaveTextContent('hace 1 h')
    expect(links[2]).toHaveTextContent('1.299,90 €')
    expect(links[2]).toHaveTextContent('hace 1 día')
    fireEvent.click(links[1])
    expect(trackCtaClick).toHaveBeenCalledWith('recent')
  })

  it('omits the daily count when nothing was posted today', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} live={live({ postedToday: 0 })} now={now} />)
    expect(screen.queryByText(/chollos hoy/)).toBeNull()
    expect(screen.getByText('Último chollo hace 12 min')).toBeInTheDocument()
  })

  it('omits the subscriber count for a small channel', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} live={live({ members: 40 })} now={now} />)
    expect(screen.queryByText(/suscriptores/)).toBeNull()
  })

  it('omits the row when there is no figure and the list without posts', () => {
    render(
      <TelegramBlock
        fetchLatestDeal={noDeal}
        live={live({ postedToday: 0, lastPostedAt: null, members: null }, [])}
        now={now}
      />,
    )
    expect(screen.queryByRole('list', { name: 'Actividad del canal' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Últimos en el canal' })).toBeNull()
    expect(screen.queryByText('Últimos en el canal')).toBeNull()
  })

  it('renders as before without live data', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} live={null} now={now} />)
    expect(screen.getByRole('heading', { name: 'Recibe los chollos al momento en Telegram' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Unirme al canal gratis' })).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(screen.queryAllByRole('list')).toHaveLength(0)
    expect(screen.queryByText(/chollos hoy|suscriptores|Último chollo/)).toBeNull()
  })

  it('renders as before when live and now are omitted', () => {
    render(<TelegramBlock fetchLatestDeal={noDeal} />)
    expect(screen.getByRole('link', { name: 'Unirme al canal gratis' })).toBeInTheDocument()
    expect(screen.queryAllByRole('list')).toHaveLength(0)
  })
})
