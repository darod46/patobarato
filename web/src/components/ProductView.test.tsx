import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatPrice } from '../lib/format'
import type { Deal } from '../lib/types'
import { productPath, tagPath } from '../lib/urls'
import { ProductView } from './ProductView'

const now = '2026-11-04T12:00:00Z'

const deal: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:19:00Z',
  price: 13.9,
  previousPrice: 22.9,
  coupon: 'Cupón 5 %',
  hashtags: ['hogar', 'cocina'],
  affiliateUrl: 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21',
  title: 'Cecotec Accesorios Freidora de aire',
  imageUrl: 'https://m.media-amazon.com/images/I/61kV8CO9K3L._AC_SL500_.jpg',
  asin: 'B0ABCDEF12',
  country: 'es',
  store: 'amazon',
  productId: 7,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
}

const related: Deal[] = [
  { ...deal, publicationId: 2, asin: 'B0ABCDEF13', title: 'Sartén antiadherente', hashtags: ['hogar'] },
  { ...deal, publicationId: 3, asin: 'B0ABCDEF14', title: 'Cafetera italiana', hashtags: ['hogar'] },
]

const exact = { normalizer: (t: string) => t }

describe('ProductView', () => {
  it('shows the deal with its price details, coupon and affiliate button', () => {
    const { container } = render(<ProductView deal={deal} related={related} now={now} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(deal.title)
    const article = within(container.querySelector('article')!)
    expect(article.getByText(formatPrice(13.9), exact)).toBeInTheDocument()
    expect(article.getByText(formatPrice(22.9), exact).tagName).toBe('S')
    expect(article.getByText(`Ahorras ${formatPrice(9)}`, exact)).toBeInTheDocument()
    expect(article.getByText('-39%')).toBeInTheDocument()
    expect(article.getByText('Cupón 5 %')).toBeInTheDocument()
    expect(article.getByText('Amazon España')).toBeInTheDocument()
    expect(container.textContent).toContain('Publicado hace 41 min · El precio puede cambiar')

    const button = screen.getByRole('link', { name: '🛒 Ver en Amazon' })
    expect(button).toHaveAttribute('href', deal.affiliateUrl)
    expect(button.getAttribute('rel')?.split(' ')).toEqual(
      expect.arrayContaining(['sponsored', 'noopener', 'noreferrer']),
    )

    const img = article.getByRole('img', { name: deal.title })
    expect(img).toHaveAttribute('src', deal.imageUrl)
    expect(img).not.toHaveAttribute('loading', 'lazy')
  })

  it('links hashtags and shows the affiliate disclaimer', () => {
    const { container } = render(<ProductView deal={deal} related={related} now={now} />)
    const tags = screen.getByRole('list', { name: 'Hashtags' })
    expect(within(tags).getByRole('link', { name: '#hogar' })).toHaveAttribute('href', tagPath('hogar'))
    expect(within(tags).getByRole('link', { name: '#cocina' })).toHaveAttribute('href', tagPath('cocina'))
    expect(container.textContent).toContain(
      'En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.',
    )
  })

  it('renders a breadcrumb to home and the first hashtag', () => {
    render(<ProductView deal={deal} related={related} now={now} />)
    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: '#hogar' })).toHaveAttribute('href', tagPath('hogar'))
  })

  it('lists related deals under the first hashtag', () => {
    render(<ProductView deal={deal} related={related} now={now} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'Más chollos de #hogar' })
    const section = heading.closest('section')!
    expect(within(section).getByRole('link', { name: /Sartén antiadherente/ })).toHaveAttribute(
      'href',
      productPath(related[0]),
    )
    expect(within(section).getAllByRole('link')).toHaveLength(2)
  })

  it('handles a minimal deal: placeholder image, no discount, no coupon, generic related heading', () => {
    const minimal: Deal = { ...deal, previousPrice: null, coupon: null, hashtags: [], imageUrl: null }
    const { container } = render(<ProductView deal={minimal} related={related} now={now} />)
    const article = container.querySelector('article')!
    expect(within(article).getByRole('img', { name: deal.title })).toHaveAttribute(
      'src',
      '/pato-placeholder.svg',
    )
    expect(article.querySelector('s')).toBeNull()
    expect(article.textContent).not.toContain('%')
    expect(article.textContent).not.toContain('Ahorras')
    expect(article.textContent).not.toContain('Cupón')
    expect(screen.queryByRole('list', { name: 'Hashtags' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Más chollos' })).toBeInTheDocument()
  })

  it('omits the related section when there are no related deals', () => {
    render(<ProductView deal={deal} related={[]} now={now} />)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })
})

describe('ProductView lowest price', () => {
  it('marks the lowest price only when the view says so', () => {
    const { unmount } = render(<ProductView deal={{ ...deal, isLowest: true }} related={[]} now={now} />)
    expect(screen.getByText('Mínimo histórico')).toBeInTheDocument()
    unmount()
    render(<ProductView deal={deal} related={[]} now={now} />)
    expect(screen.queryByText('Mínimo histórico')).toBeNull()
  })
})
