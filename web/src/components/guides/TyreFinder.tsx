import { Calculator } from 'lucide-react'
import { useId, type CSSProperties } from 'react'

/** Awin iframe versions of the Neumaticos.es finder (never the `<script>` one: it uses document.write). */
export const AWIN_FINDER_WIDE = 'https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1'
export const AWIN_FINDER_NARROW = 'https://www.awin1.com/cawshow.php?v=11552&s=2718820&q=397643&r=3145511&iframe=1'

const FRAME = {
  title: 'Buscador de neumáticos de Neumaticos.es',
  loading: 'lazy',
  sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation',
  referrerPolicy: 'strict-origin-when-cross-origin',
} as const

/**
 * When the card is narrower than 468 px the iframe shrinks to fit it (never grows). `tan(atan2(a, b))` is the
 * CSS way to get the unitless ratio a / b of two lengths; `100cqw` is the card's content width (the section is
 * the size container). The wrapper clips the untransformed layout box down to the scaled height.
 */
const NARROW_WRAPPER = {
  '--finder-scale': 'min(1, tan(atan2(100cqw, 468px)))',
  height: 'calc(60px * var(--finder-scale))',
} as CSSProperties

/** Neumaticos.es tyre finder (Awin): 728×90 from `md`, 468×60 scaled to the screen below it. */
export function TyreFinder() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="@container flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <Calculator size={20} aria-hidden="true" className="text-primary" />
        Calcula el precio en tu medida
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.
      </p>
      <iframe {...FRAME} src={AWIN_FINDER_WIDE} width="728" height="90" className="hidden max-w-full border-0 md:block" />
      <div className="w-full overflow-hidden md:hidden" style={NARROW_WRAPPER}>
        <iframe
          {...FRAME}
          src={AWIN_FINDER_NARROW}
          width="468"
          height="60"
          className="border-0"
          style={{ transform: 'scale(var(--finder-scale))', transformOrigin: 'top left' }}
        />
      </div>
    </section>
  )
}
