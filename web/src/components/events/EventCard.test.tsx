import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { siteEvent } from '../../test-utils/siteEvent'
import { EventCard } from './EventCard'

const NOW = new Date('2026-11-10T10:00:00Z')

const renderCard = (over = {}) =>
  render(
    <ul>
      <EventCard
        event={siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', ...over })}
        now={NOW}
      />
    </ul>,
  )

describe('EventCard', () => {
  it('links to the event page with name, range, stores and first intro line', () => {
    renderCard({ stores: ['amazon', 'pccomponentes'], introMd: 'Un **gran** viernes de [ofertas](https://x.es).\nSegunda línea' })
    expect(screen.getByRole('link', { name: /Black Friday/ })).toHaveAttribute('href', '/eventos/black-friday')
    expect(screen.getByText('27 – 29 de noviembre')).toBeInTheDocument()
    expect(screen.getByText('Un gran viernes de ofertas.')).toBeInTheDocument()
    expect(screen.queryByText(/Segunda línea/)).not.toBeInTheDocument()
    expect(screen.getByText(/Amazon/)).toBeInTheDocument()
    expect(screen.getByText('Próximo')).toBeInTheDocument()
  })

  it('prefixes approximate dates with "Previsto para"', () => {
    renderCard({ startsOn: '2027-07-01', endsOn: '2027-07-31', approximate: true })
    expect(screen.getByText('Previsto para julio')).toBeInTheDocument()
  })

  it.each([
    ['2026-11-09', '2026-11-12', 'En marcha'],
    ['2026-10-01', '2026-10-02', 'Pasado'],
  ])('shows the phase badge for %s', (startsOn, endsOn, label) => {
    renderCard({ startsOn, endsOn })
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
