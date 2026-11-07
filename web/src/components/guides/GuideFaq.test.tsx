import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GuideFaq } from './GuideFaq'

describe('GuideFaq', () => {
  it('renders one details per question with Markdown answers', () => {
    const { container } = render(<GuideFaq faq={[{ q: '¿Una?', aMd: 'Sí **claro**' }, { q: '¿Dos?', aMd: 'No' }]} />)
    expect(container.querySelectorAll('details')).toHaveLength(2)
    expect(screen.getByText('¿Una?')).toBeInTheDocument()
    expect(screen.getByText('claro').tagName).toBe('STRONG')
  })
})
