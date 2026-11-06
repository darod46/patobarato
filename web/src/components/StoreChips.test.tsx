import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StoreChips } from './StoreChips'

const stores = [{ store: 'amazon', deals: 5, coupons: 1 }, { store: 'aliexpress', deals: 1, coupons: 0 }]

describe('StoreChips', () => {
  it('shows short names and marks the active store', () => {
    render(<StoreChips stores={stores} active="aliexpress" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'AliExpress' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Amazon' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a store and clears with Todas', () => {
    const onSelect = vi.fn()
    render(<StoreChips stores={stores} active="amazon" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'AliExpress' }))
    expect(onSelect).toHaveBeenLastCalledWith('aliexpress')
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})
