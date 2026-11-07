import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { useUrlFilters } from './useUrlFilters'

afterEach(() => history.replaceState(null, '', '/'))

describe('useUrlFilters', () => {
  it('parses the initial query string and exposes no search term', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    const { result } = renderHook(() => useUrlFilters())
    expect(result.current).not.toHaveProperty('q')
    expect(result.current).not.toHaveProperty('setQ')
    expect(result.current.tag).toBe('juguetes')
  })

  it('parses and clears the store filter', () => {
    history.replaceState(null, '', '/?tienda=aliexpress')
    const { result } = renderHook(() => useUrlFilters())
    expect(result.current.store).toBe('aliexpress')
    act(() => result.current.clear())
    expect(result.current.store).toBeNull()
    expect(location.search).toBe('')
  })

  it('setStore updates the URL and null removes it', () => {
    history.replaceState(null, '', '/?utm=tv')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setStore('pccomponentes'))
    expect(location.search).toContain('tienda=pccomponentes')
    expect(location.search).toContain('utm=tv')
    act(() => result.current.setStore(null))
    expect(location.search).toBe('?utm=tv')
  })

  it('ignores a malformed tienda value', () => {
    history.replaceState(null, '', '/?tienda=a%20b')
    const { result } = renderHook(() => useUrlFilters())
    expect(result.current.store).toBeNull()
  })

  it('setTag updates the URL and keeps other params', () => {
    history.replaceState(null, '', '/?q=lego&utm=x')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.setTag('sony'))
    expect(location.search).toContain('tag=sony')
    expect(location.search).toContain('utm=x')
    expect(result.current.tag).toBe('sony')
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
    const { tag } = useUrlFilters()
    return <p>{`tag=${tag ?? ''}`}</p>
  }

  it('starts empty on the server so the hydration render matches', () => {
    history.replaceState(null, '', '/?q=lego&tag=juguetes')
    expect(renderToString(<Probe />)).toContain('<p>tag=</p>')
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

describe('useUrlFilters clear', () => {
  it('also removes the order', () => {
    history.replaceState(null, '', '/?orden=minimo')
    const { result } = renderHook(() => useUrlFilters())
    act(() => result.current.clear())
    expect(location.search).toBe('')
    expect(result.current.sort).toBe('recientes')
  })
})
