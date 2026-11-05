import { tagPath } from '../lib/urls'

type Props = {
  tags: string[]
  active: string | null
  /** Button mode (filters in place). Without it the chips are links to `/chollos/{tag}` and `/`. */
  onSelect?: (tag: string | null) => void
}

const base = 'rounded-full px-3 py-1 text-sm font-medium transition-colors'
const on = 'bg-carbon text-white'
const off = 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

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
    <div className="flex flex-wrap gap-2">
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
