import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { GuideItemInput } from '../../lib/guides'
import { GuideItemsEditor } from './GuideItemsEditor'

function item(over: Partial<GuideItemInput> = {}): GuideItemInput {
  return { name: '', award: '', summaryMd: '', pros: [], cons: [], specs: [], imageUrl: '', stores: [], ...over }
}

let latest: GuideItemInput[] = []
function Host({ initial }: { initial: GuideItemInput[] }) {
  const [v, setV] = useState(initial)
  useEffect(() => {
    latest = v
  })
  return <GuideItemsEditor value={v} onChange={setV} />
}

describe('GuideItemsEditor', () => {
  it('store link shows sin precio todavía when no price', () => {
    render(
      <Host
        initial={[
          item({
            name: 'Ninja',
            stores: [
              { id: 1, store: 'amazon', externalId: 'B0', url: 'https://a', note: '', price: { price: 1299.9, previousPrice: null, currency: 'EUR', checkedAt: '2026-11-08T10:00:00Z', error: null } },
              { id: 2, store: 'aliexpress', externalId: '9', url: 'https://b', note: '', price: null },
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText(/1\.299,90 €/)).toBeInTheDocument()
    expect(screen.getAllByText('sin precio todavía')).toHaveLength(1)
  })

  it('adds, reorders and removes items', async () => {
    render(<Host initial={[item({ name: 'A' })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Añadir producto' }))
    expect(latest).toHaveLength(2)
    await userEvent.type(screen.getAllByLabelText('Nombre')[1], 'B')
    await userEvent.click(screen.getAllByRole('button', { name: 'Subir producto' })[1])
    expect(latest.map((i) => i.name)).toEqual(['B', 'A'])
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar producto' })[0])
    expect(latest.map((i) => i.name)).toEqual(['A'])
  })

  it('per-item state follows the item when reordered', async () => {
    render(<Host initial={[item({ name: 'A', summaryMd: 'aa' }), item({ name: 'B', summaryMd: 'bb' })]} />)
    const cards = () => screen.getAllByRole('group', { name: /^Producto \d/ })
    await userEvent.click(within(cards()[1]).getByRole('button', { name: 'Vista previa' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Subir producto' })[1])
    expect(within(cards()[0]).getByTestId('markdown-preview')).toHaveTextContent('bb')
    expect(within(cards()[1]).queryByTestId('markdown-preview')).toBeNull()
  })

  it('edits specs and store links', async () => {
    render(<Host initial={[item({ name: 'A' })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Añadir especificación' }))
    await userEvent.type(screen.getByLabelText('Etiqueta'), 'Capacidad')
    await userEvent.type(screen.getByLabelText('Valor'), '7 L')
    expect(latest[0].specs).toEqual([{ label: 'Capacidad', value: '7 L' }])
    await userEvent.click(screen.getByRole('button', { name: 'Añadir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'amazon')
    await userEvent.type(screen.getByLabelText('ID externo'), 'B0')
    expect(screen.getByText('ASIN en Amazon, id numérico en AliExpress, slug en tiendas Awin')).toBeInTheDocument()
    expect(latest[0].stores[0]).toMatchObject({ store: 'amazon', externalId: 'B0' })
  })
})
