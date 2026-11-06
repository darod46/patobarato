import { ArrowRight } from 'lucide-react'
/** "Hola, soy el Pato": who is behind the site and how it is funded. */
export function AboutBlock() {
  return (
    <section id="sobre" className="scroll-mt-32 py-14 md:py-16">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <div className="flex flex-col gap-5 rounded-3xl border border-warm-line bg-warm p-6 md:flex-row md:items-start md:gap-8 md:p-8">
          <img src="/pato-heroe.svg" alt="" width={96} height={96} className="h-24 w-24 shrink-0 object-contain" />
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-[28px]">Hola, soy el Pato</h2>
            <p className="text-[15px] leading-relaxed text-muted md:text-base">
              PatoBarato nació como un canal de Telegram para no perderse ningún chollo de Amazon. Vigilo los
              canales de ofertas y publico cada chollo con su precio, el precio anterior y el cupón si lo hay,
              sin trucos ni cifras inventadas.
            </p>
            <p className="text-[15px] leading-relaxed text-muted md:text-base">
              Nos financiamos con enlaces de afiliado: si compras, la tienda nos da una pequeña comisión y a ti no
              te cuesta nada más.
            </p>
            <a href="/afiliados" className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Cómo funciona la afiliación
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
