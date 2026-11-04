import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchBox } from './SearchBox'

afterEach(() => vi.useRealTimers())

describe('SearchBox', () => {
  it('calls onChange once, 300 ms after typing stops', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<SearchBox value="" onChange={onChange} />)
    const input = screen.getByLabelText('Buscar chollos')
    fireEvent.change(input, { target: { value: 'son' } })
    fireEvent.change(input, { target: { value: 'sony' } })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('sony')
  })

  it('shows the placeholder', () => {
    render(<SearchBox value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Buscar chollos…')).toBeInTheDocument()
  })

  it('syncs when the value prop changes', () => {
    const { rerender } = render(<SearchBox value="a" onChange={() => {}} />)
    rerender(<SearchBox value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Buscar chollos')).toHaveValue('')
  })
})
