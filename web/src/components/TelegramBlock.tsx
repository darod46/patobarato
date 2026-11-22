import { Clock, Flame, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { formatPrice, timeAgo } from '../lib/format'
import { formatMembers, messageUrl, type ChannelLive } from '../lib/telegram'
import type { Deal } from '../lib/types'
import { TelegramCta } from './TelegramCta'
import { TelegramPreview } from './TelegramPreview'

type Fact = { key: string; icon: ReactNode; text: string }

/** Figures for the data row; each one is left out when it is unknown or would look empty. */
function channelFacts(live: ChannelLive, now: Date): Fact[] {
  const { postedToday, lastPostedAt, members } = live.stats
  const facts: Fact[] = []
  if (postedToday > 0) {
    facts.push({ key: 'today', icon: <Flame size={16} aria-hidden="true" />, text: `${postedToday} chollos hoy` })
  }
  if (lastPostedAt) {
    facts.push({ key: 'last', icon: <Clock size={16} aria-hidden="true" />, text: `Último chollo ${timeAgo(lastPostedAt, now)}` })
  }
  const shown = formatMembers(members)
  if (shown) {
    facts.push({ key: 'members', icon: <Users size={16} aria-hidden="true" />, text: `${shown} suscriptores` })
  }
  return facts
}

export function TelegramBlock({
  fetchLatestDeal,
  live = null,
  now,
}: {
  fetchLatestDeal: () => Promise<Deal | null>
  /** Live channel activity read on the server; nothing extra renders when null. */
  live?: ChannelLive | null
  /** Time for the relative dates (the page's render time first, so hydration matches). */
  now?: Date
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

  const facts = live && now ? channelFacts(live, now) : []
  const posts = live && now ? live.posts : []

  return (
    <section id="telegram" className="scroll-mt-32 bg-ink py-16 text-white">
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 md:px-8 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.02em] md:text-[34px]">
            Recibe los chollos al momento en Telegram
          </h2>
          <p className="text-[#b7bcc6] md:text-lg">
            Cada oferta llega al canal con su precio, el precio anterior, el cupón si lo hay y un
            botón directo a la tienda.
          </p>
          {facts.length > 0 && (
            <ul aria-label="Actividad del canal" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#b7bcc6]">
              {facts.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <span className="text-accent">{f.icon}</span>
                  {f.text}
                </li>
              ))}
            </ul>
          )}
          <TelegramCta
            placement="block"
            className="inline-flex h-14 items-center rounded-xl bg-white px-7 text-base font-semibold text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Unirme al canal gratis
          </TelegramCta>
        </div>
        {(deal || posts.length > 0) && (
          <div className="flex flex-col gap-6">
            {deal && <TelegramPreview deal={deal} />}
            {now && posts.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 id="telegram-recent" className="text-sm font-semibold uppercase tracking-wide text-[#b7bcc6]">
                  Últimos en el canal
                </h3>
                <ul aria-labelledby="telegram-recent" className="flex flex-col gap-2">
                  {posts.map((p) => (
                    <li key={p.messageId}>
                      <TelegramCta
                        placement="recent"
                        href={messageUrl(p.messageId)}
                        className="flex items-center justify-between gap-4 rounded-xl bg-[#2b3039] px-4 py-3 text-sm hover:bg-[#343a45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <span className="line-clamp-2 font-medium">{p.title}</span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="font-bold">{formatPrice(p.price)}</span>
                          <span className="text-xs text-[#b7bcc6]">{timeAgo(p.publishedAt, now)}</span>
                        </span>
                      </TelegramCta>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
