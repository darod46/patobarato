import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useUrlFilters } from './useUrlFilters'

afterEach(() => history.replaceState(null, '', '/'))

describe('useUrlFilters', () => {
  it('parses the initial query string', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    const { result } = renderHook(() => useUrlFilters())
    expect(result.current.q).toBe('lego')
    expect(result.current.tag).toBe('juguetes')
  })

  it('setTag updates the URL and keeps other params', () => {
    history.replaceState(null, '', '/?q=lego&utm=x')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setTag('sony'))
    expect(location.search).toContain('tag=sony')
    expect(location.search).toContain('utm=x')
    expect(result.current.tag).toBe('sony')
  })

  it('setQ uses replaceState and empty removes the param', () => {
    const before = history.length
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setQ('abc'))
    expect(location.search).toContain('q=abc')
    expect(history.length).toBe(before)
    act(() => result.current.setQ(''))
    expect(location.search).not.toContain('q=')
  })

  it('clear removes both params', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.clear())
    expect(location.search).toBe('')
    expect(result.current.q).toBe('')
    expect(result.current.tag).toBeNull()
  })

  it('reacts to popstate', () => {
    const { result } = renderHook(() => useUrlFilters())
    act(() => {
      history.replaceState(null, '', '/?tag=lego')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.tag).toBe('lego')
  })
})
