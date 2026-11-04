import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HashtagChips } from './HashtagChips'

describe('HashtagChips', () => {
  it('prepends an active tag missing from tags, pressed', () => {
    render(<HashtagChips tags={['sony']} active="lego" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '#lego' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '#sony' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Todos selects null and is pressed without active tag', async () => {
    const onSelect = vi.fn()
    render(<HashtagChips tags={['sony']} active={null} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '#sony' }))
    expect(onSelect).toHaveBeenCalledWith('sony')
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})
