import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FilteredHomePage from './page'

describe('/buscar', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-06T10:00:00Z'), toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  it('renders the events calendar like the home', async () => {
    render(await FilteredHomePage())
    expect(screen.getAllByText('11.11 de AliExpress').length).toBeGreaterThan(0)
    expect(screen.queryByText('No hay eventos próximos en el calendario.')).toBeNull()
  })
})
