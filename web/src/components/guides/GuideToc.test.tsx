import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { item } from './test-fixtures'
import { GuideToc } from './GuideToc'

describe('GuideToc', () => {
  it('links to every section and product in both layouts', () => {
    const { container } = render(<GuideToc items={[item(1), item(2)]} />)
    const expected = ['#eleccion-rapida', '#producto-1', '#producto-2', '#comparativa', '#como-elegir', '#faq']
    const desktop = container.querySelector('.hidden.lg\\:block') as HTMLElement
    const mobile = container.querySelector('details') as HTMLElement
    for (const root of [desktop, mobile]) {
      expect(within(root).getAllByRole('link', { hidden: true }).map((a) => a.getAttribute('href'))).toEqual(expected)
    }
    expect(screen.getAllByText('En esta guía').length).toBeGreaterThan(0)
  })

  it('keeps the desktop list free of collapsible summary', () => {
    const { container } = render(<GuideToc items={[item(1)]} />)
    const desktop = container.querySelector('.hidden.lg\\:block') as HTMLElement
    expect(desktop.querySelector('summary')).toBeNull()
    expect(container.querySelector('details')?.className).toContain('lg:hidden')
  })

  it('omits the quick-picks anchor when there are no items', () => {
    const { container } = render(<GuideToc items={[]} hasComparison={false} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs.filter((h) => h === '#eleccion-rapida')).toEqual([])
    expect(hrefs).toContain('#como-elegir')
    const flagged = render(<GuideToc items={[item(1)]} hasQuickPicks={false} />)
    expect([...flagged.container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).not.toContain('#eleccion-rapida')
  })

  it('omits anchors for missing sections', () => {
    const { container } = render(<GuideToc items={[item(1)]} hasComparison={false} hasHowToChoose={false} hasFaq={false} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#eleccion-rapida', '#producto-1', '#eleccion-rapida', '#producto-1'])
  })
})
