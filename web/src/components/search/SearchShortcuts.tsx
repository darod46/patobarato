import { storeInfo } from '../../lib/stores'
import { tagPath } from '../../lib/urls'

type Props = {
  tags: string[]
  /** Store ids (as in `StoreStats.store`). */
  stores: string[]
}

const CHIP =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Plain link chips shown when there is no query: popular hashtags and stores. */
export function SearchShortcuts({ tags, stores }: Props) {
  if (tags.length === 0 && stores.length === 0) return null
  return (
    <div className="flex flex-col gap-8">
      {tags.length > 0 && (
        <section aria-labelledby="atajos-tags" className="flex flex-col gap-3">
          <h2 id="atajos-tags" className="font-display text-xl font-bold text-ink">
            Búsquedas habituales
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <a key={tag} href={tagPath(tag)} className={CHIP}>
                #{tag}
              </a>
            ))}
          </div>
        </section>
      )}
      {stores.length > 0 && (
        <section aria-labelledby="atajos-tiendas" className="flex flex-col gap-3">
          <h2 id="atajos-tiendas" className="font-display text-xl font-bold text-ink">
            Tiendas
          </h2>
          <div className="flex flex-wrap gap-2">
            {stores.map((store) => {
              const { slug, name } = storeInfo(store)
              return (
                <a key={store} href={`/tiendas/${slug}`} className={CHIP}>
                  {name}
                </a>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
