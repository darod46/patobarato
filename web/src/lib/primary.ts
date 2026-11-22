/**
 * Runs the primary read of a statically prerendered page. At runtime a failure is rethrown, so Next keeps
 * serving the last ISR version and nothing empty is cached. During `next build` (no database needed) it
 * logs and resolves `undefined`, and the page renders its honest empty state until the first revalidation.
 */
export function primary<T>(label: string, load: () => Promise<T>): Promise<T | undefined> {
  return Promise.resolve()
    .then(load)
    .catch((error: unknown) => {
      if (process.env.NEXT_PHASE !== 'phase-production-build') throw error
      console.error(`${label}: server data unavailable at build —`, error instanceof Error ? `${error.name}: ${error.message}` : error)
      return undefined
    })
}
