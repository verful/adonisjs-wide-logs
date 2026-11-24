import type { Logger } from '@adonisjs/core/logger'

import type { WideEventFields } from './wide_event.ts'

export interface EmittedEvent {
  level: 'info' | 'error'
  fields: WideEventFields
}

/**
 * Where emitted wide events go. The provider writes them to the app logger;
 * `wideEvents.fake()` swaps in a `FakeSink`
 */
export interface WideEventSink {
  write(event: EmittedEvent): void
}

export class LoggerSink implements WideEventSink {
  constructor(private logger: Logger) {}

  write({ level, fields }: EmittedEvent) {
    if (level === 'error') {
      this.logger.error(fields)
    } else {
      this.logger.info(fields)
    }
  }
}

interface Waiter {
  name: string
  where: (fields: WideEventFields) => boolean
  resolve: (event: EmittedEvent) => void
}

export interface WaitForOptions {
  /**
   * Only an event whose fields pass this check counts
   */
  where?: (fields: WideEventFields) => boolean

  /**
   * Milliseconds to wait before rejecting. Defaults to 2000
   */
  timeout?: number
}

/**
 * Keeps emitted events in memory, for tests. Read them with `events` or
 * `named`, or wait for one that is written after the response
 */
export class FakeSink implements WideEventSink {
  readonly events: EmittedEvent[] = []
  #waiters = new Set<Waiter>()

  constructor(private onRestore: () => void) {}

  write(event: EmittedEvent) {
    this.events.push(event)
    for (const waiter of this.#waiters) {
      if (event.fields['event'] === waiter.name && waiter.where(event.fields)) {
        this.#waiters.delete(waiter)
        waiter.resolve(event)
      }
    }
  }

  /**
   * Events whose `event` field is `name` (`http.request`, `job.finished`)
   */
  named(name: string) {
    return this.events.filter((event) => event.fields['event'] === name)
  }

  /**
   * Resolve with the first event named `name`, already written or still to
   * come
   */
  waitFor(name: string, options: WaitForOptions = {}): Promise<EmittedEvent> {
    const where = options.where ?? (() => true)
    const written = this.named(name).find((event) => where(event.fields))
    if (written) {
      return Promise.resolve(written)
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { name, where, resolve }
      const timer = setTimeout(() => {
        this.#waiters.delete(waiter)
        reject(new Error(`No "${name}" wide event within ${options.timeout ?? 2000}ms`))
      }, options.timeout ?? 2000)
      waiter.resolve = (event) => {
        clearTimeout(timer)
        resolve(event)
      }
      this.#waiters.add(waiter)
    })
  }

  /**
   * Send events back to the sink in place before `wideEvents.fake()`
   */
  restore() {
    this.onRestore()
  }
}
