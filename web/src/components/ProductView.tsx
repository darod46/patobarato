import { discountPercent, formatPrice, timeAgo } from '../lib/format'
import { storeInfo } from '../lib/stores'
import type { Deal } from '../lib/types'
import { tagPath } from '../lib/urls'
import { AmazonButton } from './AmazonButton'
import { DealCard } from './DealCard'

const PLACEHOLDER = '/pato-placeholder.svg'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const AFFILIATE_DISCLAIMER =
  'En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.'

type Props = {
  deal: Deal
  related: Deal[]
  /** Server render time (ISO), so relative times are identical on server and client. */
  now: string
}

export function ProductView({ deal, related, now }: Props) {
  const clock = new Date(now)
  const store = storeInfo(deal.store)
  const discount =
    deal.previousPrice !== null ? discountPercent(deal.price, deal.previousPrice) : null
  const saving = discount !== null ? deal.previousPrice! - deal.price : null
  const tag = deal.hashtags[0]
  // fetchRelatedDeals falls back to the latest deals when the tag has no others.
  const relatedByTag = !!tag && related.every((d) => d.hashtags.includes(tag))

  return (
    <>
      <nav aria-label="Ruta de navegación" className="text-sm text-muted">
        <ol className="flex min-w-0 items-center gap-1.5">
          <li className="shrink-0">
            <a href="/" className={`hover:underline ${FOCUS}`}>
              Inicio
            </a>
          </li>
          {tag && (
            <li className="flex shrink-0 items-center gap-1.5">
              <span aria-hidden="true">›</span>
              <a href={tagPath(tag)} className={`hover:underline ${FOCUS}`}>
                #{tag}
              </a>
            </li>
          )}
          <li className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true">›</span>
            <span aria-current="page" className="truncate">
              {deal.title}
            </span>
          </li>
        </ol>
      </nav>

      <article className="mt-4 grid gap-6 md:mt-6 md:grid-cols-2 md:gap-10">
        <div className="relative mx-auto aspect-square w-full max-w-44 overflow-hidden rounded-2xl border border-line bg-white sm:max-w-md md:max-w-none">
          {deal.imageUrl ? (
            <img
              src={deal.imageUrl}
              alt={deal.title}
              width={500}
              height={500}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-contain p-6 mix-blend-multiply"
            />
          ) : (
            <img
              src={PLACEHOLDER}
              alt={deal.title}
              width={200}
              height={200}
              className="absolute inset-0 m-auto h-1/2 w-1/2 object-contain opacity-90"
            />
          )}
          {discount !== null && (
            <span className="absolute top-3 left-3 rounded-lg bg-danger px-3 py-1 text-sm font-bold text-white">
              -{discount}%
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-bold text-muted">
            <span aria-hidden="true" className="text-accent-ink">
              ●
            </span>
            <span>{store.name}</span>
          </span>
          <h1 className="text-2xl leading-tight font-extrabold md:text-3xl">{deal.title}</h1>
          <div className="flex flex-wrap items-baseline justify-center gap-3 md:justify-start">
            <span className="price font-display text-4xl font-bold tracking-[-0.02em]">{formatPrice(deal.price)}</span>
            {discount !== null && (
              <s className="price text-lg text-muted">{formatPrice(deal.previousPrice!)}</s>
            )}
            {deal.isLowest && (
              <span className="rounded-lg bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                Mínimo histórico
              </span>
            )}
          </div>
          {saving !== null && (
            <p className="price text-sm font-semibold">{`Ahorras ${formatPrice(saving)}`}</p>
          )}
          {deal.coupon && (
            <p className="rounded-md bg-surface px-3 py-1.5 text-sm text-muted">{deal.coupon}</p>
          )}
          <p className="text-sm text-muted">
            {`Publicado ${timeAgo(deal.publishedAt, clock)} · El precio puede cambiar`}
          </p>

          {/* Mobile: fixed bottom bar (above the home indicator); desktop: inline. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:w-full md:max-w-sm md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <AmazonButton url={deal.affiliateUrl} store={deal.store} className="w-full" />
          </div>
          <p className="max-w-sm text-xs text-muted">{AFFILIATE_DISCLAIMER}</p>

          {deal.hashtags.length > 0 && (
            <ul aria-label="Hashtags" className="flex flex-wrap justify-center gap-2 md:justify-start">
              {deal.hashtags.map((t) => (
                <li key={t}>
                  <a
                    href={tagPath(t)}
                    className={`inline-block rounded-full bg-surface px-3 py-1 text-sm text-muted hover:bg-line ${FOCUS}`}
                  >
                    #{t}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">
            {relatedByTag ? `Más chollos de #${tag}` : 'Más chollos'}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {related.map((d) => (
              <DealCard key={d.publicationId} deal={d} now={clock} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
