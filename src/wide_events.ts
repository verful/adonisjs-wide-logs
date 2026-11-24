import { runtime } from './runtime.ts'
import { FakeSink } from './sink.ts'
import type { AppendOptions, WideEventFields } from './wide_event.ts'

export interface MeasureOptions<T> {
  /**
   * Count a result that resolved as an error, such as an HTTP response
   * with a 4xx or 5xx status
   */
  failed?: (result: T) => boolean
}

/**
 * Add context to the wide event of the unit of work in progress (a request,
 * a job, a `wideEvents.run`). Every call is a no-op outside one
 */
export const wideEvents = {
  /**
   * Merge `fields` into the event. Nested objects merge key by key
   */
  set(fields: WideEventFields) {
    runtime.current()?.set(fields)
  },

  append(key: string, item: unknown, options?: AppendOptions) {
    runtime.current()?.append(key, item, options)
  },

  /**
   * Add `amount` to the number at a dotted path
   */
  increment(path: string, amount = 1) {
    runtime.current()?.increment(path, amount)
  },

  /**
   * Read `section` from `read` whenever the event is written, including
   * running snapshots of long jobs
   */
  track(section: string, read: () => WideEventFields) {
    runtime.current()?.track(section, read)
  },

  /**
   * Describe an error the work handled, without failing it
   */
  recordError(error: unknown) {
    runtime.current()?.recordError(error)
  },

  /**
   * Fail the work: the event is written as an error
   */
  fail(error: unknown) {
    runtime.current()?.fail(error)
  },

  /**
   * Write nothing for the current unit of work
   */
  discard() {
    runtime.current()?.discard()
  },

  /**
   * Keep the event open until `work` settles, for work that continues after
   * the response. A rejection fails the event
   */
  waitUntil(work: Promise<unknown>) {
    runtime.current()?.waitUntil(work)
  },

  /**
   * Run `work` and record it under `path`: `count`, `errors` and the total
   * `duration_ms`. Use it for calls to other systems
   */
  async measure<T>(path: string, work: () => Promise<T>, options: MeasureOptions<T> = {}) {
    const event = runtime.current()
    const startedAt = performance.now()
    event?.increment(`${path}.count`)
    try {
      const result = await work()
      if (options.failed?.(result)) {
        event?.increment(`${path}.errors`)
      }
      return result
    } catch (error) {
      event?.increment(`${path}.errors`)
      throw error
    } finally {
      event?.increment(`${path}.duration_ms`, Math.round(performance.now() - startedAt))
    }
  },

  /**
   * Run `work` as its own unit of work with its own event named `name`: a
   * scheduled task, one message of a listener, one item of a loop. A throw
   * fails the event and is rethrown. The event is written once `work` and
   * its `waitUntil` promises settle
   */
  async run<T>(name: string, fields: WideEventFields, work: () => Promise<T> | T): Promise<T> {
    const event = runtime.open({ event: name, ...fields })
    try {
      return await runtime.storage.run(event, work)
    } catch (error) {
      event.fail(error)
      throw error
    } finally {
      void event.settled().then(() => runtime.emit(event))
    }
  },

  /**
   * Keep events in memory instead of writing them, until `restore()`
   */
  fake() {
    const previous = runtime.sink
    const fake = new FakeSink(() => {
      runtime.sink = previous
    })
    runtime.sink = fake
    return fake
  },
}
