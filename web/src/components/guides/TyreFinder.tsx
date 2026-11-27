'use client'

import { Calculator, Search } from 'lucide-react'
import { useId, useState } from 'react'

/**
 * Awin iframe version of the Neumaticos.es finder (never the `<script>` one: it uses document.write). This
 * creative (2718820) embeds Neumaticos.es's own configurator, which adapts to the width and keeps its
 * accents; the 728×90 banner one (3743674) rendered a fixed bar with broken encoding («BÃºsqueda»).
 * The configurator is a 580 px iframe inside Awin's page (8 px body margin), hence the 600 px height.
 */
export const AWIN_FINDER = 'https://www.awin1.com/cawshow.php?v=11552&s=2718820&q=397643&r=3145511&iframe=1'

/**
 * Neumaticos.es tyre finder (Awin), loaded on demand: a button first, so Awin's affiliate cookies are only
 * set after the reader asks for the finder; then a single full-width iframe, responsive on its own.
 */
export function TyreFinder() {
  const headingId = useId()
  const [loaded, setLoaded] = useState(false)
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <Calculator size={20} aria-hidden="true" className="text-primary" />
        Calcula el precio en tu medida
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.
      </p>
      {loaded ? (
        <iframe
          src={AWIN_FINDER}
          width="100%"
          height="600"
          title="Buscador de neumáticos de Neumaticos.es"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full rounded-xl border border-line bg-white"
        />
      ) : (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-soft px-4 text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Search size={18} aria-hidden="true" />
            Cargar el buscador de Neumaticos.es
          </button>
          <p className="text-xs text-muted">Al cargarlo, Awin establece cookies de seguimiento de afiliado en su propio dominio.</p>
        </div>
      )}
    </section>
  )
}
