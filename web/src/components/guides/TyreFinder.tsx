import { Calculator } from 'lucide-react'
import { useId } from 'react'

/** Awin iframe version of the Neumaticos.es finder (never the `<script>` one: it uses document.write). The page embeds Neumaticos.es's responsive configurator. */
export const AWIN_FINDER = 'https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1'

/** Neumaticos.es tyre finder (Awin): a single full-width iframe, responsive on its own. */
export function TyreFinder() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <Calculator size={20} aria-hidden="true" className="text-primary" />
        Calcula el precio en tu medida
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.
      </p>
      <iframe
        src={AWIN_FINDER}
        width="100%"
        height="600"
        title="Buscador de neumáticos de Neumaticos.es"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full rounded-xl border border-line bg-white"
      />
    </section>
  )
}
