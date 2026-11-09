import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ qs: '', push: vi.fn(), pathname: '/ofertas' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.qs),
  useRouter: () => ({ push: nav.push, replace: nav.push }),
  usePathname: () => nav.pathname,
}))

import { ListPanelLayout, usePanelId } from './ListPanelLayout'

describe('ListPanelLayout', () => {
  beforeEach(() => {
    nav.qs = ''
    nav.push.mockReset()
  })

  it('panel opens from ?id and closes to the list', async () => {
    nav.qs = 'id=7'
    const { result } = renderHook(() => usePanelId())
    expect(result.current[0]).toBe('7')
    const onClose = vi.fn()
    render(<ListPanelLayout list={<p>lista</p>} panel={<p>detalle 7</p>} onClose={onClose} />)
    expect(screen.getByText('lista')).toBeInTheDocument()
    expect(screen.getByText('detalle 7')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(onClose).toHaveBeenCalled()
    act(() => result.current[1](null))
    expect(nav.push).toHaveBeenLastCalledWith('/ofertas')
    act(() => result.current[1]('9'))
    expect(nav.push).toHaveBeenLastCalledWith('/ofertas?id=9')
  })

  it('renders only the list when there is no panel', () => {
    render(<ListPanelLayout list={<p>lista</p>} panel={null} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
  })

  it('usePanelId returns null without ?id', () => {
    const { result } = renderHook(() => usePanelId())
    expect(result.current[0]).toBeNull()
  })
  it('setId preserves other query params', () => {
    nav.qs = 'tab=x&id=7'
    const { result } = renderHook(() => usePanelId())
    act(() => result.current[1]('9'))
    expect(nav.push).toHaveBeenLastCalledWith('/ofertas?tab=x&id=9')
    act(() => result.current[1](null))
    expect(nav.push).toHaveBeenLastCalledWith('/ofertas?tab=x')
  })
})
