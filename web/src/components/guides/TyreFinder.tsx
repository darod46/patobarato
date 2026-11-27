'use client'

import { Calculator, Cookie } from 'lucide-react'
import { useId } from 'react'
import { useConsent, writeConsent } from '../../lib/consent'

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

const LINK = 'font-semibold text-primary underline underline-offset-2 hover:text-primary-hover'

/**
 * Neumaticos.es tyre finder (Awin). Awin's affiliate cookies need consent: the finder loads once the reader
 * accepts, in the site's cookie banner or right here, and can be withdrawn below it.
 */
export function TyreFinder() {
  const headingId = useId()
  // undefined during the server render: the finder never loads there.
  const consent = useConsent()
  const accepted = consent === 'yes'
  const decide = (value: boolean) => writeConsent(value ? 'yes' : 'no')

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <Calculator size={20} aria-hidden="true" className="text-primary" />
        Calcula el precio en tu medida
      </h2>
      {accepted ? (
        <>
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
            comisión. Lo sirve Awin, que usa cookies de seguimiento de afiliado.{' '}
            <button type="button" onClick={() => decide(false)} className={LINK}>
              Retirar consentimiento
            </button>
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-white p-4">
          <p className="flex gap-2 text-sm leading-relaxed text-muted">
            <Cookie size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
            <span>
              Elige la medida de tu neumático y verás el precio actual en Neumaticos.es. El buscador lo sirve Awin,
              que usa cookies de afiliado, por eso solo lo cargamos si aceptas. Más información en la{' '}
              <a href="/cookies" className={LINK}>
                política de cookies
              </a>
              .
            </span>
          </p>
          <button
            type="button"
            onClick={() => decide(true)}
            disabled={consent === undefined}
            className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
          >
            Aceptar y mostrar el buscador
          </button>
        </div>
      )}
    </section>
  )
}
