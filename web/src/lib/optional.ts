/**
 * Runs a server-side loader and resolves to `undefined` on any failure (including a synchronous
 * throw such as missing env vars), so each part of a page degrades on its own. The failure is
 * logged with a label so Vercel's build and function logs show why a page rendered without data.
 */
export function optional<T>(label: string, load: () => Promise<T>): Promise<T | undefined> {
  return Promise.resolve()
    .then(load)
    .catch((error: unknown) => {
      console.error(`${label}: server data unavailable —`, error instanceof Error ? error.message : error)
      return undefined
    })
}
