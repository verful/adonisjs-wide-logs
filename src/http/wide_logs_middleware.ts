import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import { runtime } from '../runtime.ts'
import { requestEvent } from './request_event.ts'

/**
 * Writes one `http.request` wide event per request, once its response is
 * sent. Register it as server middleware after the static and Vite
 * middleware, so serving an asset writes nothing
 */
export default class WideLogsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const event = requestEvent.open(ctx)
    ctx.response.response.once('close', () => requestEvent.close(ctx, event))
    await runtime.storage.run(event, next)
  }
}
