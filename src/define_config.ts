import type { HttpContext } from '@adonisjs/core/http'

import type { SamplingConfig } from './sampling.ts'
import type { WideEventFields } from './wide_event.ts'

export interface HttpConfig {
  /**
   * Route params whose values are secret. Their values are replaced by
   * `:<name>` in the logged `path`. Defaults to names containing token,
   * secret, signature, password or key
   */
  secretParams?: RegExp | string[]

  /**
   * The id written as `user_id`. Defaults to `ctx.auth.user.id`. An
   * `undefined` result leaves a `user_id` the app set itself
   */
  user?: (ctx: HttpContext) => unknown

  /**
   * Fields the app adds to every request's event when it ends, such as the
   * tenant
   */
  context?: (ctx: HttpContext) => WideEventFields | undefined
}

export interface QueueConfig {
  /**
   * How often a running job writes a `job.progress` snapshot, in
   * milliseconds. Defaults to 30 000
   */
  progressInterval?: number

  /**
   * Ace commands that run the queue worker, tagged `role: 'worker'`.
   * Defaults to `['queue:work']`
   */
  workerCommands?: string[]
}

export interface WideLogsConfig {
  http?: HttpConfig
  queue?: QueueConfig
  sampling?: SamplingConfig
}

export interface ResolvedConfig {
  http: {
    isSecretParam: (name: string) => boolean
    user: (ctx: HttpContext) => unknown
    context: (ctx: HttpContext) => WideEventFields | undefined
  }
  queue: { progressInterval: number; workerCommands: string[] }
  sampling: SamplingConfig
}

const SECRET_PARAMS = /token|secret|signature|password|key/i

export function defineConfig(config: WideLogsConfig = {}): ResolvedConfig {
  const secret = config.http?.secretParams ?? SECRET_PARAMS
  return {
    http: {
      isSecretParam: Array.isArray(secret)
        ? (name) => secret.includes(name)
        : (name) => secret.test(name),
      user: config.http?.user ?? defaultUser,
      context: config.http?.context ?? (() => undefined),
    },
    queue: {
      progressInterval: config.queue?.progressInterval ?? 30_000,
      workerCommands: config.queue?.workerCommands ?? ['queue:work'],
    },
    sampling: config.sampling ?? {},
  }
}

function defaultUser(ctx: HttpContext): unknown {
  return (ctx as { auth?: { user?: { id?: unknown } } }).auth?.user?.id
}
