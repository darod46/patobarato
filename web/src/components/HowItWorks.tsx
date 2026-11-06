import { Eye, ListChecks, Send } from 'lucide-react'

const STEPS = [
  {
    title: '1 · Vigilamos',
    text: 'Seguimos los canales de chollos de Telegram y leemos cada oferta en cuanto se publica.',
    Icon: Eye,
  },
  {
    title: '2 · Filtramos',
    text: 'Extraemos precio, precio anterior y cupón, y descartamos duplicados y ofertas caducadas. «Mínimo histórico» solo aparece cuando hay publicaciones anteriores con las que comparar.',
    Icon: ListChecks,
  },
  {
    title: '3 · Publicamos',
    text: 'La oferta sale aquí y en el canal con un botón directo a la tienda. Tú decides si compras.',
    Icon: Send,
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
            <div key={step.title} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6 md:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <step.Icon size={22} aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
