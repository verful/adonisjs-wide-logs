import { ExceptionHandler as BaseExceptionHandler, type HttpContext } from '@adonisjs/core/http'

import { requestEvent } from './request_event.ts'

/**
 * AdonisJS's exception handler, which also puts each reported error on the
 * request's wide event. Extend it in place of the core one; everything else
 * (ignore lists, an error's own `report()`, rendering, status pages) is
 * unchanged
 */
export class ExceptionHandler extends BaseExceptionHandler {
  override async report(error: unknown, ctx: HttpContext) {
    requestEvent.recordError(ctx, error)
    return super.report(error, ctx)
  }

  /**
   * Tag AdonisJS's own error line with the `request_id` the wide event
   * uses, so the two join
   */
  protected override context(ctx: HttpContext) {
    return { request_id: ctx.request.id() }
  }
}
