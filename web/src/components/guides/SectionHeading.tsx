import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Section title of a guide: the duck's yellow icon chip next to the heading. */
export function SectionHeading({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/30 text-accent-ink">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 id={id} className="font-display text-2xl font-bold tracking-[-0.02em]">
        {children}
      </h2>
    </div>
  )
}
