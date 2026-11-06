import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
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

  it('setQ with whitespace only removes the param', () => {
    history.replaceState(null, '', '/?q=lego')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setQ('   '))
    expect(location.search).toBe('')
    expect(result.current.q).toBe('')
  })

  it('setQ keeps a trailing space in q and the URL', () => {
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setQ('lego '))
    expect(result.current.q).toBe('lego ')
    expect(location.search).toBe('?q=lego+')
  })

  it('clear removes both params', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.clear())
    expect(location.search).toBe('')
    expect(result.current.q).toBe('')
    expect(result.current.tag).toBeNull()
  })

  it('lowercases the tag and rejects invalid ones', () => {
    history.replaceState(null, '', '/?tag=LEGO')
    expect(renderHook(() => useUrlFilters()).result.current.tag).toBe('lego')
    history.replaceState(null, '', '/?tag=a%7D')
    expect(renderHook(() => useUrlFilters()).result.current.tag).toBeNull()
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

describe('useUrlFilters server render', () => {
  function Probe() {
    const { q, tag } = useUrlFilters()
    return <p>{`q=${q};tag=${tag ?? ''}`}</p>
  }

  it('starts empty on the server so the hydration render matches', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    expect(renderToString(<Probe />)).toContain('q=;tag=')
  })
})

describe('useUrlFilters sort', () => {
  it('reads ?orden= and falls back to recientes for unknown values', () => {
    history.replaceState(null, '', '/?orden=descuento')
    expect(renderHook(() => useUrlFilters()).result.current.sort).toBe('descuento')
    history.replaceState(null, '', '/?orden=xyz')
    expect(renderHook(() => useUrlFilters()).result.current.sort).toBe('recientes')
    history.replaceState(null, '', '/')
    expect(renderHook(() => useUrlFilters()).result.current.sort).toBe('recientes')
  })

  it('setSort writes orden and recientes removes it', () => {
    history.replaceState(null, '', '/?q=lego')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setSort('minimo'))
    expect(location.search).toContain('orden=minimo')
    expect(location.search).toContain('q=lego')
    expect(result.current.sort).toBe('minimo')
    act(() => result.current.setSort('recientes'))
    expect(location.search).not.toContain('orden=')
    expect(result.current.sort).toBe('recientes')
  })
})
