import { ChevronDown } from 'lucide-react'
import type { GuideItem } from '../../lib/types'

const LINK =
  'flex min-h-11 items-center text-sm text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Table of contents: always open on desktop, a native collapsible `<details>` on mobile. */
export function GuideToc({ items }: { items: GuideItem[] }) {
  const links = [
    { href: '#eleccion-rapida', label: 'Nuestra elección rápida' },
    ...items.map((it, i) => ({ href: `#producto-${it.position}`, label: `${i + 1}. ${it.name}` })),
    { href: '#comparativa', label: 'Comparativa' },
    { href: '#como-elegir', label: 'Cómo elegir' },
    { href: '#faq', label: 'Preguntas frecuentes' },
  ]
  return (
    <nav aria-label="En esta guía" className="rounded-2xl border border-line bg-surface p-4">
      <details open className="group lg:[&>summary]:pointer-events-none">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-base font-bold">
          En esta guía
          <ChevronDown size={18} aria-hidden="true" className="transition-transform group-open:rotate-180 lg:hidden" />
        </summary>
        <ul className="mt-1 flex flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={LINK}>{l.label}</a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  )
}
