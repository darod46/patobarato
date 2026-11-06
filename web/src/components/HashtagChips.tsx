import { tagPath } from '../lib/urls'

type Props = {
  tags: string[]
  active: string | null
  /** Button mode (filters in place). Without it the chips are links to `/chollos/{tag}` and `/`. */
  onSelect?: (tag: string | null) => void
}

const base =
  'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const on = 'bg-ink font-semibold text-white'
const off = 'bg-surface font-medium text-ink hover:bg-line'

function Chip({
  label,
  pressed,
  href,
  onSelect,
}: {
  label: string
  pressed: boolean
  href: string
  onSelect?: () => void
}) {
  const className = `${base} ${pressed ? on : off}`
  if (onSelect) {
    return (
      <button type="button" aria-pressed={pressed} onClick={onSelect} className={className}>
        {label}
      </button>
    )
  }
  return (
    <a href={href} aria-current={pressed ? 'page' : undefined} className={className}>
      {label}
    </a>
  )
}

export function HashtagChips({ tags, active, onSelect }: Props) {
  const shown = active && !tags.includes(active) ? [active, ...tags] : tags
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
      <Chip
        label="Todos"
        pressed={active === null}
        href="/"
        onSelect={onSelect && (() => onSelect(null))}
      />
      {shown.map((tag) => (
        <Chip
          key={tag}
          label={`#${tag}`}
          pressed={active === tag}
          href={tagPath(tag)}
          onSelect={onSelect && (() => onSelect(tag))}
        />
      ))}
    </div>
  )
}
