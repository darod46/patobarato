import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatPrice } from '../lib/format'
import type { Deal } from '../lib/types'
import { productPath, tagPath } from '../lib/urls'
import { ProductView } from './ProductView'

const now = '2026-11-04T12:00:00Z'

const deal: Deal = {
  publicationId: 1, status: 'active', endedAt: null,
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
  priceBeforeCoupon: false,
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

    const button = screen.getByRole('link', { name: 'Ver en Amazon' })
    expect(button).toHaveAttribute('href', deal.affiliateUrl)
    expect(button.getAttribute('rel')?.split(' ')).toEqual(
      expect.arrayContaining(['sponsored', 'noopener', 'noreferrer']),
    )

    const img = article.getByRole('img', { name: deal.title })
    expect(img).toHaveAttribute('src', deal.imageUrl)
    expect(img).not.toHaveAttribute('loading', 'lazy')
  })

  it('labels a price before coupon with "sin cupón" next to the price', () => {
    const { container } = render(
      <ProductView deal={{ ...deal, priceBeforeCoupon: true }} related={[]} now={now} />,
    )
    const article = within(container.querySelector('article')!)
    expect(article.getByTestId('price-before-coupon')).toHaveTextContent('sin cupón')
  })

  it('has no "sin cupón" label for a plain price', () => {
    const { container } = render(<ProductView deal={deal} related={[]} now={now} />)
    expect(container.textContent).not.toContain('sin cupón')
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

  it('uses the store CTA, direct link and no Amazon disclaimer for other stores', () => {
    const pc: Deal = { ...deal, store: 'pccomponentes', affiliateUrl: 'https://www.pccomponentes.com/x' }
    const { container } = render(<ProductView deal={pc} related={[]} now={now} />)
    expect(screen.getByRole('link', { name: 'Ir a PcComponentes' })).toHaveAttribute('href', pc.affiliateUrl)
    expect(container.textContent).not.toContain('Afiliado de Amazon')
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
    expect(screen.getByRole('heading', { level: 2, name: 'Más chollos de hoy' })).toBeInTheDocument()
  })

  it('omits the related section when there are no related deals', () => {
    render(<ProductView deal={deal} related={[]} now={now} />)
    expect(screen.queryByRole('heading', { level: 2, name: /Más chollos/ })).toBeNull()
  })

  it('shows the Telegram card between the buy block and the related section', () => {
    render(<ProductView deal={deal} related={related} now={now} />)
    const cta = screen.getByRole('heading', { level: 2, name: '¿Se te ha escapado?' })
    const buy = screen.getByRole('link', { name: 'Ver en Amazon' })
    const more = screen.getByRole('heading', { level: 2, name: 'Más chollos de #hogar' })
    expect(buy.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cta.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('links the guides that feature the offer under the buy button', () => {
    render(
      <ProductView
        deal={deal}
        related={[]}
        now={now}
        guides={[
          { slug: 'mejores-freidoras', title: 'Mejores freidoras' },
          { slug: 'airfryer-baratas', title: 'Airfryers baratas' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Mejores freidoras' })).toHaveAttribute('href', '/guias/mejores-freidoras')
    expect(screen.getByRole('link', { name: 'Airfryers baratas' })).toHaveAttribute('href', '/guias/airfryer-baratas')
    expect(screen.getAllByText(/Esta oferta aparece en la guía:/)).toHaveLength(2)
  })

  it('shows no guide links by default', () => {
    render(<ProductView deal={deal} related={[]} now={now} />)
    expect(screen.queryByText(/Esta oferta aparece en la guía/)).toBeNull()
  })
})

describe('ProductView ended deal', () => {
  const ended: Deal = { ...deal, status: 'ended', endedAt: '2026-11-23T10:00:00Z', isLowest: true }

  it('warns that the offer ended, strikes the price and drops the savings details', () => {
    const { container } = render(<ProductView deal={ended} related={related} now={now} />)
    const article = container.querySelector('article')!
    expect(article.textContent).toContain('Oferta caducada · terminó el 23 nov')
    expect(within(article).getByText(formatPrice(13.9), exact).tagName).toBe('S')
    expect(article.textContent).not.toContain('Ahorras')
    expect(article.textContent).not.toContain(formatPrice(22.9))
    expect(article.textContent).not.toContain('-39%')
    expect(article.textContent).not.toContain('Mínimo histórico')
  })

  it('shows only when it was published, without the price-may-change note', () => {
    const { container } = render(<ProductView deal={ended} related={[]} now={now} />)
    expect(screen.getByText('Publicado hace 41 min', exact)).toBeInTheDocument()
    expect(container.textContent).not.toContain('El precio puede cambiar')
  })

  it('places the warning above the price', () => {
    render(<ProductView deal={ended} related={[]} now={now} />)
    const warning = screen.getByText('Oferta caducada · terminó el 23 nov', exact)
    const price = screen.getByText(formatPrice(13.9), exact)
    expect(warning.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('replaces the fixed buy bar with an inline secondary link to the current price', () => {
    const { container } = render(<ProductView deal={ended} related={related} now={now} />)
    expect(container.querySelector('.fixed')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Ver en Amazon' })).toBeNull()
    const link = screen.getByRole('link', { name: 'Ver precio actual en Amazon' })
    expect(link).toHaveAttribute('href', deal.affiliateUrl)
    expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['sponsored', 'noopener']))
  })

  it('does not mention Amazon in the current-price link of other stores', () => {
    const pc: Deal = { ...ended, store: 'pccomponentes', affiliateUrl: 'https://www.pccomponentes.com/x' }
    render(<ProductView deal={pc} related={[]} now={now} />)
    expect(screen.getByRole('link', { name: 'Ver precio actual' })).toHaveAttribute('href', pc.affiliateUrl)
  })

  it('keeps the Telegram card and the related deals', () => {
    render(<ProductView deal={ended} related={related} now={now} />)
    expect(screen.getByRole('heading', { level: 2, name: '¿Se te ha escapado?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Más chollos de #hogar' })).toBeInTheDocument()
  })

  it('keeps the fixed bar and no warning for an active deal', () => {
    const { container } = render(<ProductView deal={deal} related={[]} now={now} />)
    expect(container.querySelector('.fixed')).not.toBeNull()
    expect(container.textContent).not.toContain('Oferta caducada')
  })
})
