import type { SiteEvent } from '../lib/types'

/** A SiteEvent fixture; one-day event unless `endsOn` is given. */
export function siteEvent(overrides: Partial<SiteEvent> & Pick<SiteEvent, 'slug' | 'name' | 'startsOn'>): SiteEvent {
  return {
    id: 1,
    stores: [],
    endsOn: overrides.startsOn,
    approximate: false,
    hashtags: [],
    aliexpressPromo: null,
    introMd: '',
    tipsMd: '',
    faq: [],
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}
