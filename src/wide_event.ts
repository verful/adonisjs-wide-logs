export type WideEventFields = Record<string, unknown>

export interface AppendOptions {
  /**
   * Most items kept in the list. Items past it are counted in
   * `<key>_omitted` instead, so a sweep over thousands of items keeps the
   * event small
   */
  limit?: number
}

/**
 * One unit of work's wide event: the fields gathered while the work runs,
 * written once when it ends. Created and emitted by the package; app code
 * reaches it through `wideEvents`
 */
export class WideEvent {
  #fields: WideEventFields
  #tracked = new Map<string, () => WideEventFields>()
  #pending = new Set<Promise<void>>()
  #startedAt = performance.now()
  #failed = false
  #discarded = false

  constructor(fields: WideEventFields = {}) {
    this.#fields = { started_at: new Date().toISOString(), ...fields }
  }

  get failed() {
    return this.#failed
  }

  get discarded() {
    return this.#discarded
  }

  /**
   * Merge `fields` into the event. Nested objects merge key by key, and an
   * `undefined` value never erases one already set
   */
  set(fields: WideEventFields) {
    merge(this.#fields, fields)
    return this
  }

  append(key: string, item: unknown, options: AppendOptions = {}) {
    const list = this.#fields[key]
    const items = Array.isArray(list) ? list : []
    if (options.limit !== undefined && items.length >= options.limit) {
      return this.increment(`${key}_omitted`)
    }
    this.#fields[key] = [...items, item]
    return this
  }

  /**
   * Add `amount` to the number at a dotted path (`http.stripe.requests`)
   */
  increment(path: string, amount = 1) {
    const keys = path.split('.')
    const last = keys.pop() ?? path
    let section = this.#fields
    for (const key of keys) {
      const next = section[key]
      if (!isPlainObject(next)) {
        section[key] = {}
      }
      section = section[key] as WideEventFields
    }
    const current = section[last]
    section[last] = (typeof current === 'number' ? current : 0) + amount
    return this
  }

  /**
   * Read `section` from `read` each time the event is written, so running
   * snapshots of long work show its progress so far
   */
  track(section: string, read: () => WideEventFields) {
    this.#tracked.set(section, read)
    return this
  }

  /**
   * Describe an error the work handled and answered (a 4xx, a declined
   * card) without failing the event
   */
  recordError(error: unknown) {
    this.#fields['error'] = describeError(error, false)
    return this
  }

  /**
   * The work failed because of `error`: the event is written as an error,
   * with the stack, and is never sampled out
   */
  fail(error: unknown) {
    this.#failed = true
    this.#fields['error'] = describeError(error, true)
    return this
  }

  /**
   * Write nothing for this unit of work, such as a polling tick that found
   * nothing to do
   */
  discard() {
    this.#discarded = true
    return this
  }

  /**
   * Hold the event open until `work` settles, for work that continues after
   * the response is sent. A rejection fails the event
   */
  waitUntil(work: Promise<unknown>) {
    const settled = work.then(
      () => {},
      (error: unknown) => {
        this.fail(error)
      }
    )
    this.#pending.add(settled)
    void settled.finally(() => this.#pending.delete(settled))
    return this
  }

  /**
   * Resolves once every `waitUntil` promise has settled
   */
  async settled() {
    while (this.#pending.size > 0) {
      await Promise.all(this.#pending)
    }
  }

  toJSON(): WideEventFields {
    const fields = merge({}, this.#fields)
    for (const [section, read] of this.#tracked) {
      merge(fields, { [section]: read() })
    }
    return {
      ...fields,
      duration_ms: Math.round(performance.now() - this.#startedAt),
      outcome: this.#failed ? 'error' : 'success',
    }
  }
}

/**
 * The HTTP status an error carries (`status` or `statusCode`), if any
 */
export function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  if (typeof status === 'number') {
    return status
  }
  return typeof statusCode === 'number' ? statusCode : undefined
}

function describeError(error: unknown, withStack: boolean): WideEventFields {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: String(error) }
  }
  const { code } = error as Error & { code?: unknown }
  const status = statusOf(error)
  return {
    type: error.name === 'Error' ? error.constructor.name : error.name,
    message: error.message,
    ...(code !== undefined && { code }),
    ...(status !== undefined && { status }),
    ...(error.cause !== undefined && { cause: describeError(error.cause, false) }),
    ...(withStack && { stack: error.stack }),
  }
}

function isPlainObject(value: unknown): value is WideEventFields {
  return typeof value === 'object' && value !== null && value.constructor === Object
}

function merge(target: WideEventFields, source: WideEventFields): WideEventFields {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue
    }
    const current = target[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      merge(current, value)
    } else {
      target[key] = isPlainObject(value) ? merge({}, value) : value
    }
  }
  return target
}
