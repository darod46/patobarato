// How the "Ver en Amazon" button opens the deal on each kind of device.
// - Android: an intent:// URL opens the Amazon app on that product (with the
//   affiliate tag) and falls back to the https URL when the app is missing.
// - iOS: the plain https link in the same tab, so iOS Universal Links hand it
//   to the Amazon app when installed (a new tab often skips the app).
// - Desktop: the plain https link in a new tab.

export type Platform = 'android' | 'ios' | 'desktop'

const AMAZON_ANDROID_PACKAGE = 'com.amazon.mShop.android.shopping'

export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  // iPadOS asks for desktop sites with a Mac user agent; only touch gives it away.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return 'desktop'
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
}

export function androidIntentUrl(url: string): string | null {
  if (!url.startsWith('https://')) return null
  const rest = url.slice('https://'.length)
  return (
    `intent://${rest}#Intent;scheme=https;package=${AMAZON_ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  )
}

export function linkTarget(platform: Platform): '_blank' | undefined {
  return platform === 'desktop' ? '_blank' : undefined
}

export function openAmazon(
  event: { preventDefault: () => void },
  url: string,
  platform: Platform,
  assign: (url: string) => void = (target) => window.location.assign(target),
): void {
  if (platform !== 'android') return
  const intent = androidIntentUrl(url)
  if (intent === null) return
  event.preventDefault()
  assign(intent)
}
