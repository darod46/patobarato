import { ChevronDown, CircleHelp } from 'lucide-react'
import { Markdown } from '../Markdown'
import { SectionHeading } from './SectionHeading'

export function GuideFaq({ faq }: { faq: { q: string; aMd: string }[] }) {
  if (faq.length === 0) return null
  return (
    <section id="faq" aria-labelledby="faq-titulo" className="scroll-mt-24">
      <SectionHeading id="faq-titulo" icon={CircleHelp}>
        Preguntas frecuentes
      </SectionHeading>
      <div className="mt-5 flex flex-col gap-2">
        {faq.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border border-line bg-white px-4 transition-colors open:border-primary/30 open:bg-primary-soft/40"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold">
              {f.q}
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface group-open:bg-white">
                <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <Markdown source={f.aMd} className="pb-4" />
          </details>
        ))}
      </div>
    </section>
  )
}
