import { useEffect, useState } from 'react'
import type { Deal } from '../lib/types'
import { TelegramPreview } from './TelegramPreview'

export function TelegramBlock({
  fetchLatestDeal,
}: {
  fetchLatestDeal: () => Promise<Deal | null>
}) {
  const [deal, setDeal] = useState<Deal | null>(null)
  // Load once; keep the first fetcher so an unstable prop cannot refetch.
  const [load] = useState(() => fetchLatestDeal)

  useEffect(() => {
    let cancelled = false
    load()
      .then((d) => {
        if (!cancelled) setDeal(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [load])

  return (
    <section className="bg-carbon py-16 text-white">
      <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 md:px-8 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <h2 className="text-3xl font-bold leading-tight">
            Recibe los chollos al momento en Telegram
          </h2>
          <p className="text-zinc-300">
            Cada oferta llega al canal con su precio, el precio anterior, el cupón si lo hay y un
            botón directo a Amazon.
          </p>
          <a
            href="https://t.me/patobarato"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-amber px-6 py-3 text-sm font-bold text-carbon hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Unirme al canal
          </a>
        </div>
        {deal && <TelegramPreview deal={deal} />}
      </div>
    </section>
  )
}
