import type { GuideItem } from '../../lib/types'

export function ComparisonTable({ items }: { items: GuideItem[] }) {
  const labels = [...new Set(items.flatMap((it) => it.specs.map((s) => s.label)))]
  if (labels.length === 0) return null
  return (
    <section id="comparativa" aria-labelledby="comparativa-titulo" className="scroll-mt-24">
      <h2 id="comparativa-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">Comparativa</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th scope="col" className="px-3 py-3 font-semibold text-muted"><span className="sr-only">Característica</span></th>
              {items.map((it) => (
                <th key={it.id} scope="col" className="px-3 py-3 font-semibold">{it.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => (
              <tr key={label} className="border-b border-line last:border-0">
                <th scope="row" className="px-3 py-3 font-semibold text-muted">{label}</th>
                {items.map((it) => (
                  <td key={it.id} className="px-3 py-3">{it.specs.find((s) => s.label === label)?.value ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
