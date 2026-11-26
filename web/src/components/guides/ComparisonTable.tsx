import { Table2 } from 'lucide-react'
import type { GuideItem } from '../../lib/types'
import { SectionHeading } from './SectionHeading'

export function ComparisonTable({ items }: { items: GuideItem[] }) {
  const labels = [...new Set(items.flatMap((it) => it.specs.map((s) => s.label)))]
  if (labels.length === 0) return null
  return (
    <section id="comparativa" aria-labelledby="comparativa-titulo" className="scroll-mt-24">
      <SectionHeading id="comparativa-titulo" icon={Table2}>
        Comparativa
      </SectionHeading>
      <div
        tabIndex={0}
        role="region"
        aria-label="Comparativa de productos"
        className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white shadow-[0_2px_12px_rgba(20,22,26,0.05)]"
      >
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="bg-primary-soft">
              <th scope="col" className="sticky left-0 bg-primary-soft px-3 py-3 font-semibold text-muted">
                <span className="sr-only">Característica</span>
              </th>
              {items.map((it, i) => (
                <th key={it.id} scope="col" className="px-3 py-3 align-bottom font-semibold">
                  <a href={`#producto-${it.position}`} className="flex flex-col gap-0.5 hover:text-primary">
                    <span className="font-display text-xs font-bold text-primary">{`#${i + 1}`}</span>
                    {it.name}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => (
              <tr key={label} className="group border-t border-line">
                <th
                  scope="row"
                  className="sticky left-0 bg-white px-3 py-3 font-semibold text-muted group-even:bg-surface"
                >
                  {label}
                </th>
                {items.map((it) => (
                  <td key={it.id} className="px-3 py-3 group-even:bg-surface">
                    {it.specs.find((s) => s.label === label)?.value ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
