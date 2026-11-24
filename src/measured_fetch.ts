import { wideEvents } from './wide_events.ts'

/**
 * `fetch` that records each call under `path` on the current wide event
 * (`count`, `errors` for thrown errors and 4xx/5xx responses, total
 * `duration_ms`)
 */
export function measuredFetch(path: string, fetchImpl: typeof fetch = globalThis.fetch) {
  return (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    wideEvents.measure(path, () => fetchImpl(input, init), {
      failed: (response) => response.status >= 400,
    })
}
