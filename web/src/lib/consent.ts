'use client'

import { useSyncExternalStore } from 'react'

/**
 * The reader's choice about third-party cookies (today only Awin's, in the tyre finder of the tyre
 * guides), kept in this browser. Storing the choice is technical and needs no consent.
 */
export const CONSENT_KEY = 'pb-consent-awin'
const EVENT = 'pb-consent-change'

export type Consent = 'yes' | 'no' | null

export function readConsent(): Consent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY)
    return value === 'yes' || value === 'no' ? value : null
  } catch {
    return null
  }
}

/** Saves the choice (null forgets it, so the banner asks again) and tells every component on the page. */
export function writeConsent(value: Consent): void {
  try {
    if (value === null) window.localStorage.removeItem(CONSENT_KEY)
    else window.localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // Private mode or blocked storage: the choice only lasts while the page is open.
    memory = value
  }
  window.dispatchEvent(new Event(EVENT))
}

let memory: Consent = null

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The stored choice; `undefined` during the server render and hydration (nothing is decided there). */
export function useConsent(): Consent | undefined {
  return useSyncExternalStore<Consent | undefined>(
    subscribe,
    () => readConsent() ?? memory,
    () => undefined,
  )
}
