type Props = {
  tags: string[]
  active: string | null
  onSelect: (tag: string | null) => void
}

const base = 'rounded-full px-3 py-1 text-sm font-medium transition-colors'
const on = 'bg-carbon text-white'
const off = 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

export function HashtagChips({ tags, active, onSelect }: Props) {
  const shown = active && !tags.includes(active) ? [active, ...tags] : tags
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={active === null}
        onClick={() => onSelect(null)}
        className={`${base} ${active === null ? on : off}`}
      >
        Todos
      </button>
      {shown.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-pressed={active === tag}
          onClick={() => onSelect(tag)}
          className={`${base} ${active === tag ? on : off}`}
        >
          #{tag}
        </button>
      ))}
    </div>
  )
}
