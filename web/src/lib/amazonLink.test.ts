import { describe, expect, it, vi } from 'vitest'
import { androidIntentUrl, detectPlatform, linkTarget, openAmazon } from './amazonLink'

const URL_ES = 'https://www.amazon.es/dp/B0GS1K5XQ8?tag=patobarato-21'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('detectPlatform', () => {
  it('detects android, ios and desktop', () => {
    expect(detectPlatform(ANDROID, 5)).toBe('android')
    expect(detectPlatform(IPHONE, 5)).toBe('ios')
    expect(detectPlatform(WINDOWS, 0)).toBe('desktop')
  })

  it('treats an iPad reporting a Mac user agent with touch as ios', () => {
    expect(detectPlatform(IPAD_DESKTOP_UA, 5)).toBe('ios')
    expect(detectPlatform(IPAD_DESKTOP_UA, 0)).toBe('desktop')
  })
})

describe('androidIntentUrl', () => {
  it('opens the Amazon app on the same page with the https url as fallback', () => {
    expect(androidIntentUrl(URL_ES)).toBe(
      'intent://www.amazon.es/dp/B0GS1K5XQ8?tag=patobarato-21' +
        '#Intent;scheme=https;package=com.amazon.mShop.android.shopping;' +
        'S.browser_fallback_url=https%3A%2F%2Fwww.amazon.es%2Fdp%2FB0GS1K5XQ8%3Ftag%3Dpatobarato-21;end',
    )
  })

  it('returns null for a non-https url', () => {
    expect(androidIntentUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('linkTarget', () => {
  it('opens a new tab only on desktop', () => {
    expect(linkTarget('desktop')).toBe('_blank')
    expect(linkTarget('ios')).toBeUndefined()
    expect(linkTarget('android')).toBeUndefined()
  })
})

describe('openAmazon', () => {
  it('on android prevents the default navigation and goes to the intent url', () => {
    const preventDefault = vi.fn()
    const assign = vi.fn()
    openAmazon({ preventDefault }, URL_ES, 'android', assign)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(androidIntentUrl(URL_ES))
  })

  it('on ios and desktop leaves the normal link alone', () => {
    for (const platform of ['ios', 'desktop'] as const) {
      const preventDefault = vi.fn()
      const assign = vi.fn()
      openAmazon({ preventDefault }, URL_ES, platform, assign)
      expect(preventDefault).not.toHaveBeenCalled()
      expect(assign).not.toHaveBeenCalled()
    }
  })
})
