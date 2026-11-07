import { ChevronDown } from 'lucide-react'
import { Markdown } from '../Markdown'

export function GuideFaq({ faq }: { faq: { q: string; aMd: string }[] }) {
  if (faq.length === 0) return null
  return (
    <section id="faq" aria-labelledby="faq-titulo" className="scroll-mt-24">
      <h2 id="faq-titulo" className="font-display text-2xl font-bold tracking-[-0.02em]">Preguntas frecuentes</h2>
      <div className="mt-4 flex flex-col gap-2">
        {faq.map((f) => (
          <details key={f.q} className="group rounded-xl border border-line bg-white px-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 font-semibold">
              {f.q}
              <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <Markdown source={f.aMd} className="pb-4" />
          </details>
        ))}
      </div>
    </section>
  )
}
