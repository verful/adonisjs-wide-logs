import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'

import { runtime } from '../runtime.ts'
import { type WideEvent, statusOf } from '../wide_event.ts'

/**
 * The request's event, for the exception handler: it runs after the
 * middleware's async context has unwound, so `wideEvents` can't reach it
 */
const requestEvents = new WeakMap<HttpContext, WideEvent>()

/**
 * Everything about one request's wide event: open, close, and when it
 * counts as failed. The middleware and the exception handler only call in
 */
export const requestEvent = {
  open(ctx: HttpContext) {
    const { request } = ctx
    const event = runtime.open({
      event: 'http.request',
      request_id: requestId(ctx),
      method: request.method(),
      user_agent: request.header('user-agent'),
      ...(request.header('x-inertia') === 'true' && { inertia: true }),
    })
    requestEvents.set(ctx, event)
    return event
  },

  /**
   * Called once the response is sent: the status that went out is known,
   * and so is the time a streamed body took
   */
  close(ctx: HttpContext, event: WideEvent) {
    const { http } = runtime.config
    const { statusCode, writableFinished } = ctx.response.response
    event.set({
      path: loggedPath(ctx, http.isSecretParam),
      route: ctx.route?.pattern,
      route_name: ctx.route?.name,
      status_code: statusCode,
      user_id: http.user(ctx),
      ...(!writableFinished && { aborted: true }),
    })
    const context = http.context(ctx)
    if (context) {
      event.set(context)
    }
    if (statusCode >= 500 && !event.failed) {
      event.fail(new Error(`Answered ${statusCode}`))
    }
    void event.settled().then(() => runtime.emit(event))
  },

  /**
   * The one rule for an error a request raised: a 4xx is context, anything
   * else fails the event
   */
  recordError(ctx: HttpContext, error: unknown) {
    const event = requestEvents.get(ctx)
    if (!event) {
      return
    }
    const status = statusOf(error)
    if (status !== undefined && status < 500) {
      event.recordError(error)
    } else {
      event.fail(error)
    }
  },
}

/**
 * The request's id, assigned when neither the client nor
 * `http.generateRequestId` gave one, so the wide event, AdonisJS's error
 * line and `request.id()` all agree
 */
function requestId(ctx: HttpContext) {
  const id = ctx.request.id()
  if (id) {
    return id
  }
  const generated = randomUUID()
  ctx.request.request.headers['x-request-id'] = generated
  return generated
}

/**
 * The request URL with the values of secret route params replaced by
 * `:<name>`, since key-based log redaction doesn't see inside a path
 */
function loggedPath(ctx: HttpContext, isSecret: (name: string) => boolean) {
  let path = ctx.request.url()
  for (const [name, value] of Object.entries(ctx.params ?? {})) {
    if (isSecret(name) && typeof value === 'string' && value !== '') {
      path = path.replaceAll(encodeURIComponent(value), `:${name}`).replaceAll(value, `:${name}`)
    }
  }
  return path
}
