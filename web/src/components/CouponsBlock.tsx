import { ArrowRight } from 'lucide-react'
import { storeNames } from '../lib/stores'
import type { Coupon } from '../lib/types'
import { CouponCard } from './CouponCard'

const MAX = 4

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** Home block with the first valid coupons; renders nothing when there are none. */
export function CouponsBlock({ coupons }: { coupons: Coupon[] }) {
  if (coupons.length === 0) return null
  const names = joinNames(storeNames(coupons.map((c) => c.store)))
  return (
    <section id="cupones" className="scroll-mt-32 bg-surface py-14 md:py-16">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-primary">Se renuevan cada semana</span>
            <h2 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-[32px]">Cupones de {names}</h2>
            <p className="mt-1.5 text-muted">Copia el código y aplícalo en el carrito. Indicamos condiciones y caducidad.</p>
          </div>
          <a href="/cupones" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Todos los cupones
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {coupons.slice(0, MAX).map((coupon) => (
            <CouponCard key={coupon.id} coupon={coupon} />
          ))}
        </div>
      </div>
    </section>
  )
}
