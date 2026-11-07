import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { item } from './fixtures'
import { GuideToc } from './GuideToc'

describe('GuideToc', () => {
  it('links to every section and product', () => {
    render(<GuideToc items={[item(1), item(2)]} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#eleccion-rapida', '#producto-1', '#producto-2', '#comparativa', '#como-elegir', '#faq'])
    expect(screen.getByText('En esta guía')).toBeInTheDocument()
  })
})
