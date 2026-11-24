import { tracingChannel } from 'node:diagnostics_channel'

import { runtime } from './runtime.ts'
import type { WideEvent } from './wide_event.ts'

/**
 * The fields this adapter reads from `@boringnode/queue`'s tracing
 * messages (`@adonisjs/queue` 0.6+). Declared here rather than imported, so
 * the package neither requires the queue nor depends on how a given
 * `@types/node` orders `TracingChannel`'s type parameters
 */
interface JobData {
  id: string
  name: string
}

interface ExecuteMessage {
  job: JobData & { attempts: number; createdAt?: number; acquiredAt?: number }
  queue: string
  status?: string
  error?: Error
  nextRetryAt?: Date
}

interface DispatchMessage {
  jobs: JobData[]
  queue: string
  delay?: number
  dedupOutcome?: string
  error?: Error
}

/**
 * Dispatches listed on the dispatching event, at most
 */
const DISPATCHES_LISTED = 20

/**
 * Give every job its own wide event: `job.started` when it begins,
 * `job.progress` snapshots while it runs and `job.finished` when it ends.
 * The job runs with its event as the current one, so app code adds context
 * with `wideEvents` as it does in a request. A dispatch from inside a unit
 * of work is listed on that work's `jobs_dispatched`. Returns a function
 * that stops all of it
 */
export function instrumentQueue(options: { progressInterval: number }) {
  const execute = tracingChannel('boringqueue.job.execute')
  const dispatch = tracingChannel('boringqueue.job.dispatch')
  const running = new WeakMap<object, { event: WideEvent; timer: NodeJS.Timeout }>()
  const dispatchers = new WeakMap<object, WideEvent>()

  const openJob = (message: object) => {
    const { job, queue } = message as ExecuteMessage
    const event = runtime.open({
      event: 'job.finished',
      job: {
        id: job.id,
        name: job.name,
        queue,
        attempt: job.attempts + 1,
        ...(job.createdAt !== undefined &&
          job.acquiredAt !== undefined && {
            queued_ms: Math.max(0, job.acquiredAt - job.createdAt),
          }),
      },
    })
    runtime.emitRunning(event, 'job.started')
    const timer = setInterval(
      () => runtime.emitRunning(event, 'job.progress'),
      options.progressInterval
    ).unref()
    running.set(message, { event, timer })
    return event
  }

  const executeHandlers = {
    start() {},
    end() {},
    asyncStart() {},
    error() {},
    asyncEnd(message: object) {
      const job = running.get(message)
      if (!job) {
        return
      }
      running.delete(message)
      clearInterval(job.timer)
      const { status, nextRetryAt, error } = message as ExecuteMessage
      job.event.set({
        job: {
          status,
          ...(nextRetryAt && { next_retry_at: nextRetryAt.toISOString() }),
        },
      })
      if (error) {
        job.event.fail(error)
      }
      void job.event.settled().then(() => runtime.emit(job.event))
    },
  }

  const dispatchHandlers = {
    start(message: object) {
      const event = runtime.current()
      if (event) {
        dispatchers.set(message, event)
      }
    },
    end() {},
    asyncStart() {},
    error() {},
    asyncEnd(message: object) {
      const event = dispatchers.get(message)
      if (!event) {
        return
      }
      const { jobs, queue, delay, dedupOutcome, error } = message as DispatchMessage
      for (const job of jobs) {
        event.append(
          'jobs_dispatched',
          {
            id: job.id,
            name: job.name,
            queue,
            ...(delay !== undefined && delay > 0 && { delay_ms: delay }),
            ...(dedupOutcome !== undefined && { dedup: dedupOutcome }),
            ...(error && { error: error.message }),
          },
          { limit: DISPATCHES_LISTED }
        )
      }
    },
  }

  execute.start.bindStore(runtime.storage, openJob)
  execute.subscribe(executeHandlers)
  dispatch.subscribe(dispatchHandlers)

  return () => {
    execute.start.unbindStore(runtime.storage)
    execute.unsubscribe(executeHandlers)
    dispatch.unsubscribe(dispatchHandlers)
  }
}
