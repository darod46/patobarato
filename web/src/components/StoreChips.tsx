import type { StoreStats } from '../lib/stores-data'
import { storeInfo } from '../lib/stores'

type Props = {
  stores: StoreStats[]
  active: string | null
  onSelect: (store: string | null) => void
}

const base =
  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const on = 'bg-ink font-semibold text-white'
const off = 'bg-surface font-medium text-ink hover:bg-line'

function Chip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`${base} ${pressed ? on : off}`}>
      {label}
    </button>
  )
}

/** Store filter pills for the feed; the caller decides when there are enough stores to show them. */
export function StoreChips({ stores, active, onSelect }: Props) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
      <Chip label="Todas" pressed={active === null} onClick={() => onSelect(null)} />
      {stores.map((s) => (
        <Chip key={s.store} label={storeInfo(s.store).short} pressed={active === s.store} onClick={() => onSelect(s.store)} />
      ))}
    </div>
  )
}
