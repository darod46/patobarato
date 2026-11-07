import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearch } from './HeaderSearch'

afterEach(() => vi.useRealTimers())

describe('HeaderSearch (live filtering)', () => {
  it('calls onChange once, 300 ms after typing stops', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<HeaderSearch value="" onChange={onChange} />)
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

  it('applies the pending text at once on Enter instead of navigating', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<HeaderSearch value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Buscar chollos'), { target: { value: 'lego' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(onChange).toHaveBeenCalledWith('lego')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('syncs when the value prop changes', () => {
    const { rerender } = render(<HeaderSearch value="a" onChange={() => {}} />)
    rerender(<HeaderSearch value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Buscar chollos')).toHaveValue('')
  })

  it('cancels a pending debounce when value changes externally', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { rerender } = render(<HeaderSearch value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Buscar chollos'), { target: { value: 'sony' } })
    rerender(<HeaderSearch value="lego" onChange={onChange} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Buscar chollos')).toHaveValue('lego')
  })

  it('clears the text and the filter with the clear button', () => {
    const onChange = vi.fn()
    render(<HeaderSearch value="sony" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))
    expect(screen.getByLabelText('Buscar chollos')).toHaveValue('')
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
  })
})

describe('HeaderSearch (plain form)', () => {
  it('is a GET form to /chollos with the query in q', () => {
    render(<HeaderSearch />)
    const form = screen.getByRole('search')
    expect(form).toHaveAttribute('action', '/chollos')
    expect(form).toHaveAttribute('method', 'get')
    const input = screen.getByLabelText('Buscar chollos')
    expect(input).toHaveAttribute('name', 'q')
    expect(input).toHaveAttribute('placeholder', 'Buscar chollos…')
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
  })

  it('shows the clear button once there is text', () => {
    render(<HeaderSearch />)
    fireEvent.change(screen.getByLabelText('Buscar chollos'), { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: 'Borrar búsqueda' })).toBeInTheDocument()
  })
})
