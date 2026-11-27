import { ArrowRight } from 'lucide-react'
import { useId } from 'react'

/** Awin link to Neumaticos.es's home page (affiliate, campaign «winter sale 2027»). */
export const NEUMATICOS_HOME = 'https://www.awin1.com/cread.php?awinmid=11552&awinaffid=3145511&campaign=winter+sale+2027&ued=https%3A%2F%2Fwww.neumaticos.es%2F&platform=ma'

/** End-of-guide banner of the tyre guides: a straight link to Neumaticos.es (the finder is already above). */
export function TyreStoreBanner() {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-3xl border border-warm-line bg-warm p-5 sm:flex-row sm:items-center sm:justify-between md:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id={headingId} className="font-display text-xl font-bold tracking-[-0.02em]">
          ¿Ya sabes qué neumático buscas?
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Compara modelos, medidas y precios directamente en Neumaticos.es. Enlace de afiliado: PatoBarato puede
          recibir una comisión.
        </p>
      </div>
      <a
        href={NEUMATICOS_HOME}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-extrabold text-ink shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Ir a Neumaticos.es
        <ArrowRight size={18} aria-hidden="true" />
      </a>
    </section>
  )
}
