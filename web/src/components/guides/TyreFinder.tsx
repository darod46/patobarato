import { Calculator } from 'lucide-react'
import { useId } from 'react'

/**
 * Neumaticos.es configurator through Awin's click URL (creative 2718820). It is what Awin's own iframe
 * (`cawshow.php?…&iframe=1`) loads inside a second frame; embedding it directly makes our page its parent,
 * so «Buscar» can take the reader to the results (the configurator navigates its parent, which Awin's
 * wrapper frame does not allow from inside the sandbox). Never Awin's `<script>` version: it uses document.write.
 */
export const AWIN_FINDER =
  'https://www.awin1.com/awclick.php?mid=11552&id=3145511&gid=397643&linkid=2718820&p=https://www.neumaticos.es/affiliates/configurator?ID=aff_tn_es_awin'

/** The configurator's own height (Awin's wrapper used a 580 px frame). */
export const FINDER_HEIGHT = 580

/** Neumaticos.es tyre finder (Awin), shown straight away; the affiliate and cookie note goes below it. */
export function TyreFinder() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <Calculator size={20} aria-hidden="true" className="text-primary" />
        Calcula el precio en tu medida
      </h2>
      <iframe
        src={AWIN_FINDER}
        width="100%"
        height={FINDER_HEIGHT}
        title="Buscador de neumáticos de Neumaticos.es"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full rounded-xl border border-line bg-white"
      />
      <p className="text-xs leading-relaxed text-muted">
        Buscador de Neumaticos.es con enlace de afiliado: si compras tras usarlo, PatoBarato puede recibir una
        comisión. Lo sirve Awin, que establece cookies de seguimiento de afiliado en su propio dominio.
      </p>
    </section>
  )
}
