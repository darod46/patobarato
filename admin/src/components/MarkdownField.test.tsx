import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MarkdownField } from './MarkdownField'

describe('MarkdownField', () => {
  it('previews markdown and never renders raw HTML', async () => {
    render(<MarkdownField label="Intro" value={'**negrita** <script>alert(1)</script><b id="raw">x</b>'} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
    const preview = screen.getByTestId('markdown-preview')
    expect(preview.querySelector('strong')?.textContent).toBe('negrita')
    expect(preview.querySelector('script')).toBeNull()
    expect(preview.querySelector('#raw')).toBeNull()
  })
})
