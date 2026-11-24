import { AsyncLocalStorage } from 'node:async_hooks'

import { type ResolvedConfig, defineConfig } from './define_config.ts'
import { type Sampler, createSampler } from './sampling.ts'
import type { WideEventSink } from './sink.ts'
import { WideEvent, type WideEventFields } from './wide_event.ts'

/**
 * The package's internal state, shared by the provider, the HTTP and queue
 * adapters and `wideEvents`. Not exported from the package
 */
class Runtime {
  readonly storage = new AsyncLocalStorage<WideEvent>()
  config: ResolvedConfig = defineConfig()
  sink: WideEventSink = { write() {} }
  #sampler: Sampler = createSampler()
  #openFields: () => WideEventFields = () => ({})

  configure(options: {
    config: ResolvedConfig
    sink: WideEventSink
    openFields: () => WideEventFields
  }) {
    this.config = options.config
    this.sink = options.sink
    this.#sampler = createSampler(options.config.sampling)
    this.#openFields = options.openFields
  }

  current() {
    return this.storage.getStore()
  }

  /**
   * A new event, with the trace ids of the span active now
   */
  open(fields: WideEventFields) {
    return new WideEvent({ ...this.#openFields(), ...fields })
  }

  emit(event: WideEvent) {
    if (event.discarded) {
      return
    }
    const fields = event.toJSON()
    const decision = this.#sampler(fields, event.failed)
    if (decision === false) {
      return
    }
    this.sink.write({
      level: event.failed ? 'error' : 'info',
      fields: decision === true ? fields : { ...fields, sample_rate: decision },
    })
  }

  /**
   * Write a snapshot of work still running (`job.started`, `job.progress`)
   */
  emitRunning(event: WideEvent, name: string) {
    if (!event.discarded) {
      this.sink.write({
        level: 'info',
        fields: { ...event.toJSON(), event: name, outcome: 'running' },
      })
    }
  }
}

export const runtime = new Runtime()
