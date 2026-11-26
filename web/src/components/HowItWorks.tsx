import { GUIDE_COVER_BG } from '../lib/guide-covers'
import { FLAGS } from '../lib/flags'

/** Illustrations in `public/como-funciona/<slug>.jpeg` (800×597, same duck and cream background as the guide covers). */
const IMAGE_WIDTH = 800
const IMAGE_HEIGHT = 597

const STEPS = [
  {
    slug: 'vigilamos',
    title: '1 · Vigilamos',
    text: 'Seguimos los canales de chollos de Telegram y leemos cada oferta en cuanto se publica.',
    alt: 'El pato de PatoBarato con prismáticos, mirando un móvil lleno de mensajes con etiquetas de precio',
  },
  {
    slug: 'filtramos',
    title: '2 · Filtramos',
    text: 'Extraemos precio, precio anterior y cupón, y descartamos duplicados y ofertas caducadas. «Mínimo histórico» solo aparece cuando hay publicaciones anteriores con las que comparar.',
    alt: 'El pato de PatoBarato revisando etiquetas de precio con una lupa y tirando las repetidas a la papelera',
  },
  {
    slug: 'publicamos',
    title: '3 · Publicamos',
    get text() {
      return FLAGS.telegram
        ? 'La oferta sale aquí y en el canal con un botón directo a la tienda. Tú decides si compras.'
        : 'La oferta sale aquí con un botón directo a la tienda. Tú decides si compras.'
    },
    alt: 'El pato de PatoBarato lanzando un avión de papel con una etiqueta de precio hacia un carrito de la compra',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-32 bg-surface py-14 md:py-16">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-[32px]">Cómo cazamos cada chollo</h2>
          <p className="mt-1.5 text-muted md:text-lg">Transparencia total: así llega una oferta desde que aparece hasta que la ves aquí.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((step) => (
            <div key={step.slug} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
              <img
                src={`/como-funciona/${step.slug}.jpeg`}
                width={IMAGE_WIDTH}
                height={IMAGE_HEIGHT}
                alt={step.alt}
                loading="lazy"
                decoding="async"
                className="aspect-[800/597] h-auto w-full object-cover"
                style={{ backgroundColor: GUIDE_COVER_BG }}
              />
              <div className="flex flex-col gap-3.5 p-6 md:p-7">
                <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
