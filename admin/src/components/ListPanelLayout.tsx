'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, type ReactNode } from 'react'

/** The open item lives in the URL as `?id=`; pages read and write it with this hook. */
// oxlint-disable-next-line react/only-export-components -- hook shared with the pages, specified to live here
export function usePanelId(): [string | null, (id: string | null) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const id = params.get('id')
  const setId = useCallback(
    (next: string | null) => {
      router.push(next ? `${pathname}?id=${encodeURIComponent(next)}` : pathname)
    },
    [router, pathname],
  )
  return [id, setId]
}

type Props = { list: ReactNode; panel: ReactNode | null; onClose: () => void }

/**
 * Desktop (lg, 1024 px): list on the left, panel on the right.
 * Below that: the panel covers the screen with a back arrow.
 */
export function ListPanelLayout({ list, panel, onClose }: Props) {
  const open = panel !== null
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-6">
      <div className={open ? 'hidden lg:block' : ''}>{list}</div>
      {open && (
        <aside className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 lg:static lg:z-auto lg:overflow-visible lg:rounded-lg lg:border lg:border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            aria-label="Volver"
            className="mb-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl hover:bg-neutral-100 lg:hidden"
          >
            ←
          </button>
          {panel}
        </aside>
      )}
    </div>
  )
}
