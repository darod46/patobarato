import { ChevronDown } from 'lucide-react'
import type { GuideItem } from '../../lib/types'

const LINK =
  'flex min-h-11 items-center text-sm text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Props = { items: GuideItem[]; hasComparison?: boolean; hasHowToChoose?: boolean; hasFaq?: boolean }

/** Table of contents: a plain list on desktop, a native collapsible `<details>` on mobile (no JS either way). */
export function GuideToc({ items, hasComparison = true, hasHowToChoose = true, hasFaq = true }: Props) {
  const links = [
    { href: '#eleccion-rapida', label: 'Nuestra elección rápida' },
    ...items.map((it, i) => ({ href: `#producto-${it.position}`, label: `${i + 1}. ${it.name}` })),
    ...(hasComparison ? [{ href: '#comparativa', label: 'Comparativa' }] : []),
    ...(hasHowToChoose ? [{ href: '#como-elegir', label: 'Cómo elegir' }] : []),
    ...(hasFaq ? [{ href: '#faq', label: 'Preguntas frecuentes' }] : []),
  ]
  const list = (
    <ul className="flex flex-col">
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} className={LINK}>{l.label}</a>
        </li>
      ))}
    </ul>
  )
  return (
    <nav aria-label="En esta guía" className="rounded-2xl border border-line bg-surface p-4">
      <div className="hidden lg:block">
        <p className="font-display text-base font-bold">En esta guía</p>
        {list}
      </div>
      <details className="group lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-base font-bold">
          En esta guía
          <ChevronDown size={18} aria-hidden="true" className="transition-transform group-open:rotate-180" />
        </summary>
        {list}
      </details>
    </nav>
  )
}
