import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('drops raw HTML such as script tags', () => {
    const { container } = render(<Markdown source={'Hola <script>alert(1)</script> mundo'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('<script')
  })

  it('renders GFM tables', () => {
    const { container } = render(<Markdown source={'| a | b |\n|---|---|\n| 1 | 2 |'} />)
    expect(container.querySelector('table')).not.toBeNull()
  })

  it('marks external links as nofollow and opens them in a new tab', () => {
    const { container } = render(<Markdown source="[tienda](https://example.com/x)" />)
    const a = container.querySelector('a')!
    expect(a.getAttribute('rel')).toBe('nofollow noopener noreferrer')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  it('leaves internal links plain', () => {
    const { container } = render(
      <Markdown source={'[a](/guias/x) [b](#top) [c](https://patobarato.com/p) [d](https://www.patobarato.com/p)'} />,
    )
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(4)
    for (const a of links) {
      expect(a.hasAttribute('rel')).toBe(false)
      expect(a.hasAttribute('target')).toBe(false)
    }
  })

  it('treats protocol-relative URLs as external', () => {
    const { container } = render(<Markdown source="[x](//evil.com/p)" />)
    expect(container.querySelector('a')!.getAttribute('target')).toBe('_blank')
  })

  it('keeps mailto links plain', () => {
    const { container } = render(<Markdown source={'[m](mailto:a@b.com)'} />)
    for (const a of container.querySelectorAll('a')) {
      expect(a.hasAttribute('target')).toBe(false)
      expect(a.hasAttribute('rel')).toBe(false)
    }
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })

  it('renders unsafe-protocol links as plain text', () => {
    const { container } = render(<Markdown source={'[x](javascript:alert(1))'} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('x')
  })
})
